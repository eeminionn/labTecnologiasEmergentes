export function orientation(point, rotation = 0, mirror = false) {
  let { x, y } = point;
  if (mirror) x = 1-x;
  if (+rotation === 90) [x,y] = [1-y,x];
  if (+rotation === 180) [x,y] = [1-x,1-y];
  if (+rotation === 270) [x,y] = [y,1-x];
  return { x,y };
}
export function homography(corners) {
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Se necesitan cuatro esquinas válidas');
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a=corners[i], b=corners[(i+1)%4], c=corners[(i+2)%4];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if (Math.abs(cross)<.01 || (sign && Math.sign(cross)!==sign)) throw new Error('El área debe ser convexa, amplia y seguir el orden indicado');
    sign=Math.sign(cross);
  }
  const targets=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const matrix=[];
  corners.forEach(({x,y},i)=>{ const {x:u,y:v}=targets[i]; matrix.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]); });
  for (let i=0;i<8;i++) {
    let best=i; for (let j=i+1;j<8;j++) if(Math.abs(matrix[j][i])>Math.abs(matrix[best][i])) best=j;
    [matrix[i],matrix[best]]=[matrix[best],matrix[i]];
    const pivot=matrix[i][i]; if(Math.abs(pivot)<1e-8) throw new Error('Calibración degenerada');
    for(let k=i;k<=8;k++) matrix[i][k]/=pivot;
    for(let j=0;j<8;j++) if(j!==i) { const f=matrix[j][i]; for(let k=i;k<=8;k++) matrix[j][k]-=f*matrix[i][k]; }
  }
  return [...matrix.map(row=>row[8]),1];
}
export function project(point, matrix) {
  if (!matrix) return {x:point.x,y:point.y};
  const [a,b,c,d,e,f,g,h,i]=matrix, w=g*point.x+h*point.y+i;
  if(Math.abs(w)<1e-6) return null;
  return {x:(a*point.x+b*point.y+c)/w,y:(d*point.x+e*point.y+f)/w};
}
