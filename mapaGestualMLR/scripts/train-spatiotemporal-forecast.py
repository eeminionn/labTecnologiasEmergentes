#!/usr/bin/env python3
"""Train and evaluate the annual map's spatial network from monthly grids."""

import json
import math
import sys

import torch
from torch import nn
from torch.nn import functional as F


SEED = 715234
CHANNELS = 16
MAX_EPOCHS = 100
MIN_HISTORY = 6
DEV_ORIGIN = 12
TEST_ORIGIN = 24
MAX_LOG_CORRECTION = 0.35


class ForecastNetwork(nn.Module):
    """Learn a residual correction to the historical spatial distribution."""

    def __init__(self, channels):
        super().__init__()
        self.input = nn.Conv2d(13, channels, 3, padding=1)
        self.residual = nn.Sequential(
            nn.Conv2d(channels, channels, 3, padding=2, dilation=2),
            nn.GELU(),
            nn.Conv2d(channels, channels, 3, padding=1),
        )
        self.output = nn.Conv2d(channels, 1, 1)
        nn.init.zeros_(self.output.weight)
        nn.init.zeros_(self.output.bias)

    def forward(self, features, log_prior, mask):
        spatial = F.gelu(self.input(features))
        correction = self.output(F.gelu(spatial + self.residual(spatial))).squeeze(1)
        logits = MAX_LOG_CORRECTION * correction.tanh()
        logits = (log_prior + logits).masked_fill(~mask, -1e9)
        return logits.flatten(1).log_softmax(dim=1)


def features(history, start, mask):
    origin = len(history)
    recent = history[-3:]
    half_year = history[-6:].mean(dim=0)
    last_year = history[-12:].mean(dim=0)
    long_term = history.mean(dim=0)
    same_season = [index for index in range(start, start + 3) if 0 <= index - 12 < origin]
    seasonal = history[[index - 12 for index in same_season]].mean(dim=0) if same_season else last_year
    prior = (long_term + 0.1).log()
    angle = (start + 1) * math.tau / 12
    spatial = torch.cat((recent, torch.stack((half_year, last_year, long_term, seasonal))))
    temporal = torch.tensor(
        ((start - origin + 3) / 12, math.sin(angle), math.cos(angle), len(same_season) / 3, 1),
        dtype=history.dtype,
    )[:, None, None].expand(-1, *mask.shape)
    inputs = torch.cat((spatial.log1p() / 4, temporal * mask, mask[None]), dim=0)
    return inputs, prior


def examples(months, cutoff, mask):
    inputs, priors, targets = [], [], []
    for origin in range(MIN_HISTORY, cutoff - 2):
        for start in range(origin, min(origin + 12, cutoff - 2), 3):
            values, prior = features(months[:origin], start, mask)
            target = months[start:start + 3].sum(dim=0).flatten()
            inputs.append(values)
            priors.append(prior)
            targets.append(target / target.sum())
    return torch.stack(inputs), torch.stack(priors), torch.stack(targets)


@torch.no_grad()
def forecast_months(model, history, length, mask):
    """Forecast a year in quarters, allocating each quarter across its months."""
    origin = len(history)
    starts = range(origin, origin + length, 3)
    feature_pairs = [features(history, start, mask) for start in starts]
    inputs, priors = (torch.stack(parts) for parts in zip(*feature_pairs))
    shapes = model(inputs, priors, mask).exp().reshape(-1, *mask.shape)
    # Citywide volume is estimated separately by calendar month. History may
    # contain forecasts for an earlier horizon, but never test observations.
    month_totals = history.sum(dim=(1, 2))
    monthly_volumes = torch.stack([
        month_totals[month % 12::12].mean() if month % 12 < origin else month_totals.mean()
        for month in range(origin, origin + length)
    ])
    return shapes.repeat_interleave(3, dim=0) * monthly_volumes[:, None, None]


def fit(months, cutoff, mask, epochs, dev_target=None):
    torch.manual_seed(SEED)
    model = ForecastNetwork(CHANNELS)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.002, weight_decay=0.01)
    inputs, priors, targets = examples(months, cutoff, mask)
    generator = torch.Generator().manual_seed(SEED)
    best = (math.inf, 0, None)
    for epoch in range(1, epochs + 1):
        model.train()
        for indices in torch.randperm(len(inputs), generator=generator).split(16):
            optimizer.zero_grad()
            log_shape = model(inputs[indices], priors[indices], mask)
            loss = -(targets[indices] * log_shape).sum(dim=1).mean()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1)
            optimizer.step()
        if dev_target is not None:
            model.eval()
            projected = forecast_months(model, months[:cutoff], len(dev_target), mask).sum(dim=0)
            mae = (projected[mask] - dev_target.sum(dim=0)[mask]).abs().mean().item()
            if mae < best[0]:
                best = (mae, epoch, {name: value.clone() for name, value in model.state_dict().items()})
    model.eval()
    if dev_target is not None:
        model.load_state_dict(best[2])
    return model, best[1], best[0]


def train(payload):
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    width, height = payload["width"], payload["height"]
    months = torch.tensor(payload["months"], dtype=torch.float32).reshape(36, height, width)
    mask = torch.tensor(payload["mask"], dtype=torch.bool).reshape(height, width)
    if torch.any(months.sum(dim=(1, 2)) <= 0):
        raise ValueError("Faltan meses de entrenamiento o de prueba.")

    _, epochs, dev_mae = fit(months, DEV_ORIGIN, mask, MAX_EPOCHS, months[DEV_ORIGIN:TEST_ORIGIN])
    held_out_model, _, _ = fit(months, TEST_ORIGIN, mask, epochs)
    held_out = forecast_months(held_out_model, months[:TEST_ORIGIN], 12, mask)
    deployed_model, _, _ = fit(months, len(months), mask, epochs)
    history = months
    future = {}
    for year in range(2026, max(map(int, payload["years"])) + 1):
        projection = forecast_months(deployed_model, history, 12, mask)
        if str(year) in payload["years"]:
            future[str(year)] = projection.sum(dim=0).flatten().tolist()
        history = torch.cat((history, projection))

    return {
        "heldOut": held_out.sum(dim=0).flatten().tolist(),
        "future": future,
        "network": {
            "framework": f"PyTorch {torch.__version__}",
            "architecture": "spatial residual convolution with direct quarterly horizons",
            "channels": CHANNELS,
            "parameters": sum(value.numel() for value in deployed_model.parameters()),
            "epochs": epochs,
            "seed": SEED,
            "maximumLogCorrection": MAX_LOG_CORRECTION,
            "developmentCutoff": "2023-12",
            "developmentPeriod": ["2024-01", "2024-12"],
            "developmentMae": round(dev_mae, 4),
            "trainedThrough": "2025-12",
            "weights": {name: value.tolist() for name, value in deployed_model.state_dict().items()},
        },
    }


if __name__ == "__main__":
    print(json.dumps(train(json.load(sys.stdin)), allow_nan=False))
