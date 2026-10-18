/* No smoothing and no cropping: works with SVG, PNG, or compatible remote images. */
export function loadPixelArt(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{
 const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);
 img.onerror=()=>reject(new Error('Cannot load image for export; check image CORS policy'));
 img.src=src;
});}
export function drawContained(ctx:CanvasRenderingContext2D,img:HTMLImageElement,x:number,y:number,w:number,h:number,fill=0.82){
 ctx.imageSmoothingEnabled=false;
 const aw=img.naturalWidth||1,ah=img.naturalHeight||1;
 const ratio=Math.min(w*fill/aw,h*fill/ah);const dw=aw*ratio,dh=ah*ratio;
 ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
