/* DREADNOUGHT — procedural PS1-style art. Stateless drawing into a 2D context.
 * STYLE FORMULA embedded as code: flat-shaded faceted shapes, low-res dithered
 * crunch, vertex-lit palette, amber CRT, sickly cyan-green bioluminescence,
 * abyssal blue-black water, dim blood-red hazards, heavy fog, CRT grain.
 * Scene art is drawn into a low-res buffer (crunch); UI/text drawn crisp on top. */
(function (root) {
  "use strict";

  var PAL = {
    ink:"#04070c", deep0:"#070c14", deep1:"#0a121d", deep2:"#0f1d2e", deep3:"#16314a",
    steel:"#2a3038", steelHi:"#444c58", steelLo:"#171b22", rivet:"#5a6472", panel:"#1d2229",
    amber:"#e0a32e", amberHi:"#ffd27a", amberLo:"#7c5212",
    phos:"#27e89a", phosHi:"#7dffcf", phosLo:"#0c3a2b", phosDim:"#11503b",
    bio:"#46f0c8", bioHi:"#9cffe6",
    rust:"#7a3f20", rustHi:"#b8703a", rustLo:"#3c1f10",
    blood:"#b32a2a", bloodHi:"#ff6452",
    bone:"#cdc6b2", boneHi:"#efe9d6",
    violet:"#8a6bd6", violetHi:"#c3aeff",
    text:"#cfe6df", textDim:"#6f8a84",
    // aged-phosphor grade targets — darker, cooler, more desaturating (dread)
    agedWash:"rgba(10,16,20,0.18)", agedTint:"rgba(120,200,170,0.035)", amberBurn:"rgba(180,120,30,0.04)",
    deadGrade:"rgba(4,7,11,0.22)",  // cold near-black multiply (lightened — less crushing, still moody)
  };

  function hash(str) { var h = 2166136261; str = String(str);
    for (var i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); } return h>>>0; }
  function srnd(seed){ var s = seed>>>0; return function(){ s=(s+0x6d2b79f5)|0; var t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill){ ctx.fillStyle=fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=lw||1; ctx.stroke(); }
  }

  // ---------- baked layers (rebuilt on size change) ----------
  var cache = { w:0, h:0, grain:null, grains:null, scan:null, band:null, bandH:0, curve:null };
  // separate pixelation buffer (device-pixel sized; independent of the porthole cache)
  var px = { canvas:null, ctx:null, dw:0, dh:0, step:0 };
  function makeCanvas(w,h){ var c=document.createElement("canvas"); c.width=w; c.height=h; return c; }

  function rebake(w, h) {
    if (cache.w === w && cache.h === h) return;
    cache.w = w; cache.h = h;
    // animated grain: 3 cycled frames (still cheap)
    cache.grains = [];
    for (var f=0; f<3; f++){
      var g = makeCanvas(w, h), gx = g.getContext("2d");
      var img = gx.createImageData(w, h), d = img.data;
      for (var i=0;i<w*h;i++){ var v = Math.random(); var a = v>0.965?20: v>0.90?8:0; var o=i*4;
        d[o]=120; d[o+1]=150; d[o+2]=140; d[o+3]=a; }
      gx.putImageData(img,0,0); cache.grains.push(g);
    }
    cache.grain = cache.grains[0]; // legacy field (drawWater uses it)
    // DENSE scanlines: 2px pitch + a faint vertical RGB phosphor stripe (color-CRT feel)
    var s = makeCanvas(w, h), sx = s.getContext("2d");
    sx.fillStyle = "rgba(0,0,0,0.16)";
    for (var y=0;y<h;y+=2) sx.fillRect(0,y,w,1);
    sx.globalAlpha = 0.05; sx.fillStyle = "#1aff80";
    for (var x=0;x<w;x+=3) sx.fillRect(x,0,1,h);
    sx.globalAlpha = 1; cache.scan = s;
    // ROLLING refresh band (scrolled vertically each frame in overlay)
    var bandH = Math.max(60, (h*0.18)|0);
    var bnd = makeCanvas(w, bandH), bx = bnd.getContext("2d");
    var bg = bx.createLinearGradient(0,0,0,bandH);
    bg.addColorStop(0,"rgba(180,255,210,0)"); bg.addColorStop(0.5,"rgba(180,255,210,0.06)"); bg.addColorStop(1,"rgba(180,255,210,0)");
    bx.fillStyle = bg; bx.fillRect(0,0,w,bandH); cache.band = bnd; cache.bandH = bandH;
    // CURVATURE + corner vignette mask (bowed-glass tube)
    var cu = makeCanvas(w, h), cx2 = cu.getContext("2d");
    var cur = cx2.createRadialGradient(w/2,h/2,Math.min(w,h)*0.30, w/2,h/2,Math.max(w,h)*0.62);
    cur.addColorStop(0,"rgba(0,0,0,0)"); cur.addColorStop(0.82,"rgba(0,0,0,0.30)"); cur.addColorStop(1,"rgba(0,0,0,0.82)");
    cx2.fillStyle = cur; cx2.fillRect(0,0,w,h);
    var corners = [[0,0],[w,0],[0,h],[w,h]];
    for (var c=0;c<4;c++){ var cc=corners[c];
      var cg = cx2.createRadialGradient(cc[0],cc[1],0, cc[0],cc[1], Math.min(w,h)*0.22);
      cg.addColorStop(0,"rgba(0,0,0,0.5)"); cg.addColorStop(1,"rgba(0,0,0,0)");
      cx2.fillStyle = cg; cx2.fillRect(0,0,w,h); }
    cache.curve = cu;
  }

  // ---------- fog / water background ----------
  function drawWater(ctx, w, h, depthT) {
    depthT = Math.max(0, Math.min(1, depthT));
    var top = mix(PAL.deep2, PAL.ink, depthT*0.85);
    var bot = mix(PAL.deep0, "#000000", depthT);
    var grd = ctx.createLinearGradient(0,0,0,h);
    grd.addColorStop(0, top); grd.addColorStop(0.55, mix(PAL.deep1, PAL.ink, depthT*0.6)); grd.addColorStop(1, bot);
    ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
    // faint teal glow far below (the source)
    var gx = ctx.createRadialGradient(w*0.5, h*1.02, h*0.05, w*0.5, h*1.02, h*0.7);
    gx.addColorStop(0, "rgba(40,120,110,"+(0.10+depthT*0.10)+")"); gx.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gx; ctx.fillRect(0,0,w,h);
    if (cache.grain){ ctx.globalAlpha = 0.5; ctx.drawImage(cache.grain,0,0,w,h); ctx.globalAlpha = 1; }
  }

  // ---------- CRT sonar scope ----------
  function drawSonar(ctx, cx, cy, r, o) {
    o = o || {}; var t = o.time||0, san = o.sanity==null?1:o.sanity;
    ctx.save();
    // bezel
    ctx.beginPath(); ctx.arc(cx,cy,r+7,0,7); ctx.fillStyle = PAL.steelLo; ctx.fill();
    ctx.lineWidth=3; ctx.strokeStyle=PAL.steel; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r+7,0,7); ctx.lineWidth=1; ctx.strokeStyle=PAL.steelHi; ctx.stroke();
    // phosphor face
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.clip();
    var fg = ctx.createRadialGradient(cx,cy,2,cx,cy,r);
    fg.addColorStop(0, "#08251c"); fg.addColorStop(1, "#03110c");
    ctx.fillStyle = fg; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    // range rings + grid
    ctx.strokeStyle = PAL.phosDim; ctx.lineWidth = 1;
    for (var ring=1; ring<=3; ring++){ ctx.beginPath(); ctx.arc(cx,cy,r*ring/3,0,7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.stroke();
    // sweep
    var ang = o.sweep||0;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
    var wedge = ctx.createLinearGradient(0,0,r,0);
    wedge.addColorStop(0,"rgba(60,255,200,0.0)"); wedge.addColorStop(1,"rgba(60,255,200,0.28)");
    for (var k=0;k<10;k++){ ctx.beginPath(); ctx.moveTo(0,0);
      ctx.arc(0,0,r,-0.04 - k*0.05, -k*0.05); ctx.closePath();
      ctx.fillStyle = "rgba(50,240,170,"+(0.16*(1-k/10))+")"; ctx.fill(); }
    ctx.strokeStyle = PAL.phosHi; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r,0); ctx.stroke();
    ctx.restore();
    // noise speckle (worse at low sanity)
    var speck = Math.floor(30 + (1-san)*260);
    ctx.fillStyle = "rgba(120,255,210,0.5)";
    var nr = srnd(((t*7)|0) ^ 0x9e37);
    for (var n=0;n<speck;n++){ var a=nr()*7, rr=nr()*r; ctx.fillRect(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr, 1,1); }
    // blips
    var cs = o.contacts||[];
    for (var c=0;c<cs.length;c++) drawBlip(ctx, cx, cy, r, cs[c], t, san);
    ctx.restore();
    // glass glare
    var gl = ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
    gl.addColorStop(0,"rgba(120,255,210,0.05)"); gl.addColorStop(0.5,"rgba(0,0,0,0)");
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.clip(); ctx.fillStyle=gl; ctx.fillRect(cx-r,cy-r,r*2,r*2); ctx.restore();
    ctx.restore();
  }

  function catColor(cat, threat) {
    if (cat === "creature") return threat>=3?PAL.bloodHi: threat>=2?PAL.blood: "#d98a3a";
    if (cat === "anomaly") return PAL.violetHi;
    if (cat === "artifact") return PAL.bio;
    if (cat === "wreck") return PAL.rustHi;
    return PAL.amber;
  }

  function drawBlip(ctx, cx, cy, r, c, t, san) {
    var x = cx + Math.cos(c.angle)*c.dist*r, y = cy + Math.sin(c.angle)*c.dist*r;
    if (c.resolved){ ctx.globalAlpha=0.35; }
    var flick = c.phantom ? (0.35 + 0.65*Math.abs(Math.sin(t*9 + c.angle*5))) : 1;
    ctx.globalAlpha *= flick;
    if (!c.known){
      // unknown: dim amber ring + ?
      ctx.strokeStyle = PAL.amberLo; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,y,5,0,7); ctx.stroke();
      ctx.fillStyle = PAL.amber; ctx.font = "bold 9px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("?", x, y+0.5);
    } else {
      var col = catColor(c.category, c.threat);
      // glow
      var gg = ctx.createRadialGradient(x,y,0,x,y,10); gg.addColorStop(0, col); gg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.globalAlpha *= 0.9; ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(x,y,10,0,7); ctx.fill(); ctx.globalAlpha/=0.9;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x,y, c.category==="creature"?4:3, 0,7); ctx.fill();
      if (c.category==="creature"){ // hostile bracket
        ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(x-6,y-6,12,12);
      }
    }
    if (c.selected){ ctx.strokeStyle=PAL.phosHi; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,y,8,0,7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // ---------- low-poly contact portrait ----------
  function shapeFor(c){
    if (c.category==="creature"){
      var n=c.name||"";
      if (/LEVIATHAN/i.test(n)) return "leviathan";
      if (/Squid/i.test(n)) return "squid";
      if (/Swimmer/i.test(n)) return "swimmer";
      if (/whale/i.test(n)) return "whale";
      if (/Shoal/i.test(n)) return "shoal";
      if (/Hagfish/i.test(n)) return "hagfish";
      return "angler";
    }
    if (c.category==="wreck") return "wreck";
    if (c.category==="artifact") return "artifact";
    return "anomaly";
  }

  function drawPortrait(ctx, x, y, size, c, t) {
    if (!c) return;
    var seed = hash((c.name||"")+(c.id||"")); var rnd = srnd(seed);
    ctx.save(); ctx.translate(x, y + Math.sin(t*1.3+seed)*size*0.02);
    var s = size;
    var sh = shapeFor(c);
    if (sh==="wreck") drawWreck(ctx, s, rnd, t);
    else if (sh==="artifact") drawArtifact(ctx, s, rnd, t);
    else if (sh==="anomaly") drawAnomaly(ctx, s, rnd, t);
    else drawCreature(ctx, s, rnd, t, sh);
    ctx.restore();
  }

  function drawCreature(ctx, s, rnd, t, kind) {
    var glow = (kind==="leviathan")?PAL.bloodHi:PAL.bio;
    // ambient bioluminescent glow
    var gg = ctx.createRadialGradient(0,0,0,0,0,s*0.9);
    gg.addColorStop(0,"rgba(70,240,200,0.18)"); gg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,0,s*0.9,0,7); ctx.fill();
    var body = PAL.deep3, bodyLo = PAL.deep1, bodyHi = "#214a5c";
    if (kind==="leviathan"){ body="#1a1320"; bodyLo="#0c0810"; bodyHi="#34203a"; }
    if (kind==="swimmer"){ body=PAL.bone; bodyLo="#8f8a78"; bodyHi=PAL.boneHi; }

    if (kind==="angler"){
      // bulbous head, big jaw, teeth, lure
      poly(ctx, [[-s*.5,0],[-s*.1,-s*.42],[s*.4,-s*.2],[s*.5,0],[s*.35,s*.3],[-s*.2,s*.42]], body, PAL.ink, 1.5);
      poly(ctx, [[-s*.5,0],[-s*.1,-s*.42],[s*.05,-s*.1],[-s*.2,s*.0]], bodyHi); // facet
      poly(ctx, [[s*.4,-s*.2],[s*.5,0],[s*.35,s*.3]], bodyLo);
      // jaw + teeth
      poly(ctx, [[s*.05,s*.08],[s*.5,0],[s*.36,s*.34]], "#0b0f12", PAL.ink,1);
      ctx.fillStyle=PAL.boneHi; for(var i=0;i<6;i++){ var tx=s*(.12+i*.06); poly(ctx,[[tx,s*.06],[tx+ s*.02,s*.06],[tx+s*.01,s*.18]],PAL.boneHi); }
      // lure
      var lx=-s*.1+Math.sin(t*2)*s*.04, ly=-s*.5;
      ctx.strokeStyle=bodyLo; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-s*.05,-s*.3); ctx.quadraticCurveTo(lx- s*.1, ly, lx, ly); ctx.stroke();
      lureGlow(ctx, lx, ly, s*0.12, glow, t);
      eye(ctx, -s*.12, -s*.08, s*.05, glow);
    } else if (kind==="leviathan"){
      // colossal — multiple maws + tentacles, fills frame
      for (var t1=0;t1<5;t1++){ var a=Math.PI*0.5 + (t1-2)*0.5; var len=s*(0.7+rnd()*0.4);
        var bx=Math.cos(a)*s*.2, by=s*.2; ctx.strokeStyle=body; ctx.lineWidth=s*0.06;
        ctx.beginPath(); ctx.moveTo(bx,by);
        ctx.quadraticCurveTo(bx+Math.cos(a+Math.sin(t+t1))*len*0.6, by+len*0.5, bx+Math.cos(a)*len, by+len); ctx.stroke(); }
      poly(ctx, [[-s*.55,-s*.1],[-s*.2,-s*.55],[s*.2,-s*.55],[s*.55,-s*.1],[s*.3,s*.35],[-s*.3,s*.35]], body, PAL.ink, 2);
      poly(ctx, [[-s*.2,-s*.55],[s*.2,-s*.55],[0,-s*.15]], bodyHi);
      poly(ctx, [[s*.55,-s*.1],[s*.3,s*.35],[s*.1,-s*.1]], bodyLo);
      // ring of eyes
      for (var e=0;e<6;e++){ var ea=(-0.6+e*0.24); eye(ctx, Math.cos(ea)*s*.3, -s*.18+Math.sin(ea)*s*.1, s*.045, glow); }
      // maw
      poly(ctx, [[-s*.16,s*.05],[s*.16,s*.05],[0,s*.34]], "#120308", PAL.blood,1);
    } else if (kind==="swimmer"){
      // pale humanoid, elongated limbs
      poly(ctx, [[-s*.07,-s*.5],[s*.07,-s*.5],[s*.1,s*.0],[-s*.1,s*.0]], body, PAL.ink,1); // torso
      ctx.beginPath(); ctx.arc(0,-s*.56,s*.12,0,7); ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle=PAL.ink; ctx.stroke(); // head
      ctx.strokeStyle=body; ctx.lineWidth=s*0.05; ctx.lineCap="round";
      var sw=Math.sin(t*1.5);
      arm(ctx,-s*.05,-s*.4, -s*.4+sw*s*.05, s*.1, -s*.3, s*.5);
      arm(ctx, s*.05,-s*.4,  s*.4-sw*s*.05, s*.1,  s*.3, s*.5);
      // hollow eyes
      eye(ctx,-s*.05,-s*.57,s*.03,"#0a0a0a"); eye(ctx,s*.05,-s*.57,s*.03,"#0a0a0a");
      var gg2=ctx.createRadialGradient(0,-s*.56,0,0,-s*.56,s*.4); gg2.addColorStop(0,"rgba(140,255,230,0.10)"); gg2.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=gg2; ctx.beginPath(); ctx.arc(0,-s*.56,s*.4,0,7); ctx.fill();
    } else if (kind==="squid"){
      poly(ctx, [[-s*.18,-s*.5],[s*.18,-s*.5],[s*.12,s*.0],[-s*.12,s*.0]], body, PAL.ink,1.5);
      poly(ctx, [[-s*.18,-s*.5],[s*.0,-s*.5],[-s*.04,-s*.1]], bodyHi);
      eye(ctx,-s*.07,-s*.28,s*.05,glow); eye(ctx,s*.07,-s*.28,s*.05,glow);
      ctx.strokeStyle=body; ctx.lineWidth=s*0.045; ctx.lineCap="round";
      for(var tt=0;tt<8;tt++){ var ox=(-s*.12)+tt*(s*.24/7); var sg=Math.sin(t*2+tt);
        ctx.beginPath(); ctx.moveTo(ox,0); ctx.quadraticCurveTo(ox+sg*s*.06, s*.3, ox+sg*s*.12, s*.5); ctx.stroke(); }
    } else { // shoal / hagfish / whale — generic eel/mass
      var segs = kind==="shoal"?5:1;
      for (var q=0;q<segs;q++){ ctx.save(); ctx.translate((q-(segs-1)/2)*s*0.28, Math.sin(t*2+q)*s*0.08);
        poly(ctx, [[-s*.28,0],[-s*.05,-s*.2],[s*.3,-s*.05],[s*.3,s*.05],[-s*.05,s*.22]], body, PAL.ink,1);
        poly(ctx, [[-s*.05,-s*.2],[s*.3,-s*.05],[s*.05,0]], bodyHi);
        poly(ctx, [[s*.18,-s*.04],[s*.3,-s*.05],[s*.3,s*.05],[s*.18,s*.04]], "#0b0f12"); // mouth
        eye(ctx, s*.12,-s*.04,s*.03,glow); ctx.restore(); }
    }
  }
  function lureGlow(ctx,x,y,r,col,t){ var p=0.6+0.4*Math.sin(t*4);
    var g=ctx.createRadialGradient(x,y,0,x,y,r*2.2); g.addColorStop(0,col); g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g; ctx.globalAlpha=p; ctx.beginPath(); ctx.arc(x,y,r*2.2,0,7); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=PAL.bioHi; ctx.beginPath(); ctx.arc(x,y,r*0.5,0,7); ctx.fill(); }
  function eye(ctx,x,y,r,col){ ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    ctx.fillStyle="#04060a"; ctx.beginPath(); ctx.arc(x,y,r*0.45,0,7); ctx.fill(); }
  function arm(ctx,x0,y0,x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo(x1,y1,x2,y2); ctx.stroke(); }

  function drawWreck(ctx, s, rnd, t) {
    // broken hull, snapped, rust + sediment
    ctx.fillStyle = PAL.rust;
    poly(ctx, [[-s*.55,s*.1],[-s*.1,-s*.18],[s*.1,-s*.12],[s*.2,s*.18],[-s*.4,s*.34]], PAL.rust, PAL.ink,1.5);
    poly(ctx, [[-s*.55,s*.1],[-s*.1,-s*.18],[-s*.2,s*.05]], PAL.rustHi);
    poly(ctx, [[s*.1,-s*.12],[s*.2,s*.18],[-s*.05,s*.1]], PAL.rustLo);
    // snapped far section
    poly(ctx, [[s*.24,s*.0],[s*.55,-s*.05],[s*.6,s*.2],[s*.3,s*.3]], mix(PAL.rust,PAL.ink,0.3), PAL.ink,1.5);
    // conning tower stub
    poly(ctx, [[-s*.28,-s*.18],[-s*.14,-s*.42],[-s*.02,-s*.4],[-s*.05,-s*.16]], PAL.rust, PAL.ink,1);
    // jagged break
    ctx.strokeStyle=PAL.rustLo; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(s*.2,s*.18); ctx.lineTo(s*.24,s*.0); ctx.stroke();
    // dim cyan glow leaking from inside
    var gg=ctx.createRadialGradient(s*.05,-s*.05,0,s*.05,-s*.05,s*.25); gg.addColorStop(0,"rgba(70,240,200,0.18)"); gg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(s*.05,-s*.05,s*.25,0,7); ctx.fill();
    // sediment
    ctx.fillStyle = "rgba(20,30,28,0.5)"; poly(ctx,[[-s*.6,s*.34],[s*.62,s*.2],[s*.62,s*.5],[-s*.6,s*.5]],"rgba(15,25,24,0.6)");
  }

  function drawArtifact(ctx, s, rnd, t) {
    // angular obsidian monolith with glowing glyphs
    var hue = PAL.bio;
    poly(ctx, [[-s*.2,-s*.55],[s*.18,-s*.5],[s*.22,s*.45],[-s*.16,s*.5]], "#0c1016", PAL.ink,1.5);
    poly(ctx, [[-s*.2,-s*.55],[s*.18,-s*.5],[s*.02,-s*.4],[-s*.12,-s*.42]], "#1b2330"); // top facet
    poly(ctx, [[s*.18,-s*.5],[s*.22,s*.45],[s*.06,s*.3]], "#05080c"); // shadow side
    // glyphs
    var p = 0.5 + 0.5*Math.sin(t*1.5);
    ctx.strokeStyle = hue; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5 + 0.4*p;
    for (var i=0;i<4;i++){ var gy=-s*.35+i*s*.22;
      ctx.beginPath(); ctx.moveTo(-s*.08,gy); ctx.lineTo(s*.06,gy- s*.04); ctx.lineTo(s*.0,gy+s*.06); ctx.stroke(); }
    ctx.globalAlpha=1;
    var gg=ctx.createRadialGradient(0,0,0,0,0,s*.6); gg.addColorStop(0,"rgba(70,240,200,"+(0.10+0.10*p)+")"); gg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,0,s*.6,0,7); ctx.fill();
  }

  function drawAnomaly(ctx, s, rnd, t) {
    // swirling rift of sickly cyan-green light
    var n = 26;
    for (var ring=3; ring>=0; ring--){
      var rr = s*(0.2 + ring*0.13);
      ctx.strokeStyle = ring%2? "rgba(120,255,230,0.5)":"rgba(120,110,220,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i=0;i<=n;i++){ var a=i/n*Math.PI*2 + t*(0.4+ring*0.2)*(ring%2?1:-1);
        var wob = rr + Math.sin(a*3 + t*2 + ring)*s*0.05;
        var x=Math.cos(a)*wob, y=Math.sin(a)*wob*0.8;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.stroke();
    }
    var gg=ctx.createRadialGradient(0,0,0,0,0,s*.7); gg.addColorStop(0,"rgba(130,255,230,0.35)"); gg.addColorStop(0.5,"rgba(120,110,220,0.12)"); gg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,0,s*.7,0,7); ctx.fill();
    ctx.fillStyle=PAL.bioHi; ctx.beginPath(); ctx.arc(0,0,s*0.06+Math.sin(t*5)*s*0.02,0,7); ctx.fill();
  }

  // ---------- cockpit frame (drawn into low-res buffer, around the scene) ----------
  function drawCockpit(ctx, w, h, view) {
    // dark metal frame: thick border with rivets + pipes; center (view) left open
    var bx = view.x, by = view.y, bw = view.w, bh = view.h;
    // fill outside the viewport with steel
    ctx.fillStyle = PAL.panel;
    ctx.fillRect(0,0,w,by);           // top
    ctx.fillRect(0,by+bh,w,h-(by+bh));// bottom
    ctx.fillRect(0,by,bx,bh);         // left
    ctx.fillRect(bx+bw,by,w-(bx+bw),bh);// right
    // panel shading
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0,0,w,8); ctx.fillRect(0,h-10,w,10);
    // viewport inner bevel
    ctx.lineWidth=6; ctx.strokeStyle=PAL.steelLo; ctx.strokeRect(bx-3,by-3,bw+6,bh+6);
    ctx.lineWidth=2; ctx.strokeStyle=PAL.steelHi; ctx.strokeRect(bx-5,by-5,bw+10,bh+10);
    // rivets along the bevel
    ctx.fillStyle = PAL.rivet;
    var step=26;
    for (var x=bx-3;x<=bx+bw+3;x+=step){ rivet(ctx,x,by-9); rivet(ctx,x,by+bh+9); }
    for (var y=by-3;y<=by+bh+3;y+=step){ rivet(ctx,bx-9,y); rivet(ctx,bx+bw+9,y); }
    // a couple of pipes top corners
    ctx.strokeStyle = PAL.steel; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(10,18); ctx.lineTo(bx-14,18); ctx.stroke();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(10,16); ctx.lineTo(bx-14,16); ctx.stroke();
    // caged lamp glow top-left
    var lg = ctx.createRadialGradient(34,34,2,34,34,60); lg.addColorStop(0,"rgba(224,163,46,0.45)"); lg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=lg; ctx.fillRect(0,0,120,120);
  }
  function rivet(ctx,x,y){ ctx.beginPath(); ctx.arc(x,y,2,0,7); ctx.fill(); }

  // ---------- HUD: gauges, cards, buttons, text (drawn crisp at full res) ----------
  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight||"bold")+" "+size+"px 'Courier New', monospace";
    ctx.textAlign = align||"left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(str, x+1, y+1);
    ctx.fillStyle = color||PAL.text; ctx.fillText(str, x, y);
  }

  function gauge(ctx, r, label, val, max, kind) {
    var pct = Math.max(0, Math.min(1, val/max));
    // housing
    ctx.fillStyle = PAL.steelLo; rrect(ctx, r.x, r.y, r.w, r.h, 3); ctx.fill();
    ctx.strokeStyle = PAL.steel; ctx.lineWidth=1; rrect(ctx, r.x, r.y, r.w, r.h, 3); ctx.stroke();
    var col = kind==="hull" ? (pct<0.3?PAL.bloodHi:"#7fd0e0")
            : kind==="oxygen" ? (pct<0.3?PAL.bloodHi:PAL.bio)
            : kind==="sanity" ? (pct<0.3?PAL.bloodHi:PAL.violetHi)
            : PAL.amberHi;
    // segmented fill
    var pad=4, bx=r.x+pad, by=r.y+r.h*0.46, bw=r.w-pad*2, bh=r.h*0.40;
    ctx.fillStyle="#05080c"; ctx.fillRect(bx,by,bw,bh);
    var segs=14, sw=bw/segs;
    for (var i=0;i<segs;i++){ if (i/segs < pct){ ctx.fillStyle = col; ctx.fillRect(bx+i*sw+1, by+1, sw-1.5, bh-2); }
      else { ctx.fillStyle="rgba(255,255,255,0.04)"; ctx.fillRect(bx+i*sw+1, by+1, sw-1.5, bh-2); } }
    text(ctx, label, r.x+pad, r.y+r.h*0.34, Math.round(r.h*0.30), PAL.textDim, "left");
    text(ctx, Math.ceil(val)+"", r.x+r.w-pad, r.y+r.h*0.34, Math.round(r.h*0.30), col, "right");
  }

  function card(ctx, r, c, opts) {
    opts = opts||{};
    ctx.save();
    var lift = opts.hover? -6 : (opts.selected? -10 : 0);
    var y = r.y + lift;
    // plate
    ctx.shadowColor="rgba(0,0,0,0.6)"; ctx.shadowBlur=opts.selected?14:6; ctx.shadowOffsetY=4;
    var base = opts.disabled? "#191c20" : PAL.steel;
    var grd = ctx.createLinearGradient(r.x,y,r.x,y+r.h); grd.addColorStop(0,PAL.steelHi); grd.addColorStop(0.12,base); grd.addColorStop(1,PAL.steelLo);
    ctx.fillStyle=grd; rrect(ctx,r.x,y,r.w,r.h,5); ctx.fill();
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    // trim by category
    var trim = c.cat==="read"?PAL.bio : c.cat==="fix"?"#7fd0e0" : c.cat==="curse"?PAL.violetHi : c.cat==="act"&&c.kind==="kill"?PAL.bloodHi : PAL.amber;
    ctx.strokeStyle = opts.selected?PAL.phosHi:(opts.playable?trim:"rgba(120,130,140,0.4)"); ctx.lineWidth = opts.selected?2:1.2; rrect(ctx,r.x,y,r.w,r.h,5); ctx.stroke();
    // glyph area
    glyph(ctx, r.x+r.w/2, y+r.h*0.40, Math.min(r.w,r.h)*0.30, c.kind, trim, opts);
    // cost pip
    ctx.fillStyle = PAL.amber; ctx.beginPath(); ctx.arc(r.x+12,y+13,10,0,7); ctx.fill();
    ctx.fillStyle="#1a1206"; ctx.beginPath(); ctx.arc(r.x+12,y+13,8,0,7); ctx.fill();
    text(ctx, c.cost+"", r.x+12, y+17, 13, PAL.amberHi, "center");
    // name + desc
    text(ctx, c.name.toUpperCase(), r.x+r.w/2, y+r.h*0.66, Math.max(8, r.w*0.085), opts.disabled?PAL.textDim:PAL.text, "center");
    wrapText(ctx, c.desc, r.x+r.w/2, y+r.h*0.74, r.w-12, Math.max(7,r.w*0.072), PAL.textDim);
    if (opts.disabled){ ctx.fillStyle="rgba(8,10,14,0.45)"; rrect(ctx,r.x,y,r.w,r.h,5); ctx.fill(); }
    ctx.restore();
  }

  function glyph(ctx, x, y, s, kind, col, opts) {
    ctx.save(); ctx.translate(x,y); ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2; ctx.lineCap="round"; ctx.lineJoin="round";
    var dim = opts && opts.disabled; if (dim) ctx.globalAlpha=0.5;
    if (kind==="ping"){ for(var i=1;i<=3;i++){ ctx.beginPath(); ctx.arc(0,0,s*0.3*i,-0.9,0.9); ctx.stroke(); } ctx.beginPath(); ctx.arc(-s*0.4,0,2,0,7); ctx.fill(); }
    else if (kind==="scan"){ ctx.beginPath(); ctx.arc(0,0,s*0.7,0,7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s,0); ctx.lineTo(s,0); ctx.moveTo(0,-s); ctx.lineTo(0,s); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,2,0,7); ctx.fill(); }
    else if (kind==="investigate"){ ctx.beginPath(); ctx.moveTo(-s*0.6,-s*0.6); ctx.lineTo(0,0); ctx.lineTo(-s*0.1,s*0.6); ctx.lineTo(s*0.6,s*0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,2,0,7); ctx.fill(); }
    else if (kind==="evade"){ ctx.beginPath(); ctx.moveTo(-s*0.7,-s*0.5); ctx.lineTo(0,-s*0.1); ctx.lineTo(-s*0.5,s*0.2); ctx.lineTo(s*0.2,s*0.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s*0.2,s*0.6); ctx.lineTo(s*0.55,s*0.35); ctx.moveTo(s*0.2,s*0.6); ctx.lineTo(s*0.6,s*0.62); ctx.stroke(); }
    else if (kind==="hull"){ ctx.beginPath(); ctx.moveTo(0,-s*0.7); ctx.lineTo(s*0.6,-s*0.4); ctx.lineTo(s*0.6,s*0.2); ctx.lineTo(0,s*0.7); ctx.lineTo(-s*0.6,s*0.2); ctx.lineTo(-s*0.6,-s*0.4); ctx.closePath(); ctx.stroke(); }
    else if (kind==="oxygen"){ ctx.beginPath(); ctx.arc(0,s*0.1,s*0.5,0,7); ctx.stroke(); ctx.beginPath(); ctx.arc(-s*0.2,-s*0.1,2,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(s*0.35,-s*0.45,s*0.18,0,7); ctx.stroke(); }
    else if (kind==="sanity"){ ctx.beginPath(); for(var a=0;a<6.2;a+=0.2){ var rr=s*0.08*a; var px=Math.cos(a)*rr, py=Math.sin(a)*rr; if(a===0)ctx.moveTo(px,py); else ctx.lineTo(px,py);} ctx.stroke(); }
    else if (kind==="kill"){ ctx.beginPath(); ctx.moveTo(-s*0.7,0); ctx.lineTo(s*0.4,0); ctx.stroke(); poly(ctx,[[s*0.4,-s*0.2],[s*0.75,0],[s*0.4,s*0.2]],col); ctx.beginPath(); ctx.moveTo(-s*0.7,-s*0.18); ctx.lineTo(-s*0.7,s*0.18); ctx.stroke(); }
    else if (kind==="reveal"){ ctx.beginPath(); ctx.ellipse(0,0,s*0.7,s*0.42,0,0,7); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,s*0.18,0,7); ctx.fill(); for(var r2=0;r2<8;r2++){ var aa=r2/8*6.28; ctx.beginPath(); ctx.moveTo(Math.cos(aa)*s*0.8,Math.sin(aa)*s*0.5); ctx.lineTo(Math.cos(aa)*s*1.0,Math.sin(aa)*s*0.65); ctx.stroke(); } }
    else if (kind==="freedescend"){ for(var d=0;d<3;d++){ ctx.beginPath(); ctx.moveTo(-s*0.5,-s*0.5+d*s*0.45); ctx.lineTo(0,-s*0.1+d*s*0.45); ctx.lineTo(s*0.5,-s*0.5+d*s*0.45); ctx.stroke(); } }
    else if (kind==="power"){ poly(ctx,[[-s*0.1,-s*0.7],[s*0.3,-s*0.1],[s*0.05,-s*0.1],[s*0.2,s*0.7],[-s*0.3,0],[-s*0.02,0]],col); }
    else if (kind==="curse"){ ctx.beginPath(); ctx.arc(0,0,s*0.6,0,7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.3); ctx.lineTo(s*0.3,s*0.3); ctx.moveTo(s*0.3,-s*0.3); ctx.lineTo(-s*0.3,s*0.3); ctx.stroke(); }
    ctx.restore();
  }

  // 3D-extruded button: a cap that floats above an extruded skirt and DEPRESSES when pressed.
  // Same signature; opts.depth = px the cap is raised (0 = fully pressed). Hit rect r is unchanged.
  function button(ctx, r, label, opts) {
    opts = opts || {}; var d = opts.depth == null ? 4 : opts.depth; if (opts.disabled) d = 1;
    ctx.fillStyle = "#0c0f13"; rrect(ctx, r.x, r.y - d + 2, r.w, r.h, 5); ctx.fill();   // skirt under the cap (the extrusion)
    ctx.fillStyle = "#14181e"; ctx.beginPath(); ctx.moveTo(r.x + r.w, r.y - d); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w - 2, r.y + r.h); ctx.lineTo(r.x + r.w - 2, r.y - d); ctx.closePath(); ctx.fill();
    var cy = r.y - d;
    var grd = ctx.createLinearGradient(r.x, cy, r.x, cy + r.h);
    grd.addColorStop(0, opts.primary ? "#3a2f12" : PAL.steelHi); grd.addColorStop(1, opts.primary ? "#1c1606" : PAL.steelLo);
    ctx.fillStyle = opts.disabled ? "#15181d" : grd; rrect(ctx, r.x, cy, r.w, r.h, 5); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x + 3, cy + 1.5); ctx.lineTo(r.x + r.w - 3, cy + 1.5); ctx.stroke();
    ctx.strokeStyle = opts.hover ? PAL.amberHi : (opts.primary ? PAL.amber : PAL.steel); ctx.lineWidth = opts.hover ? 2 : 1.2; rrect(ctx, r.x, cy, r.w, r.h, 5); ctx.stroke();
    text(ctx, label, r.x + r.w / 2, cy + r.h / 2 + Math.round(r.h * 0.18), Math.min(18, Math.round(r.h * 0.42)), opts.disabled ? PAL.textDim : (opts.primary ? PAL.amberHi : PAL.text), "center");
  }

  // full aged-CRT composite. opts: {scanlines, flash, flashCol, sanity, time, glitch, grade, pixel}
  function overlay(ctx, w, h, opts) {
    opts = opts||{}; var t = opts.time||0, cv = ctx.canvas;
    // (0) aged-phosphor grade — darker + more desaturating (dread)
    if (opts.grade !== false) {
      ctx.fillStyle = PAL.agedWash; ctx.fillRect(0,0,w,h);
      ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = PAL.agedTint; ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.5; ctx.fillStyle = PAL.amberBurn; ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 1; ctx.fillStyle = PAL.deadGrade; ctx.fillRect(0,0,w,h); ctx.restore();
    }
    // (0.5) FULL-SCREEN PIXELATION — downscale the composited frame, blit back chunky.
    if (opts.pixel && opts.pixel > 1.05) {
      var step = Math.max(1, Math.round(opts.pixel)), dw = cv.width, dh = cv.height;
      var pw = Math.max(1, Math.ceil(dw / step)), ph2 = Math.max(1, Math.ceil(dh / step));
      if (!px.canvas || px.dw !== dw || px.dh !== dh || px.step !== step) {
        if (!px.canvas) { px.canvas = makeCanvas(pw, ph2); px.ctx = px.canvas.getContext("2d"); }
        else { px.canvas.width = pw; px.canvas.height = ph2; }
        px.dw = dw; px.dh = dh; px.step = step;
      }
      var pctx = px.ctx; pctx.imageSmoothingEnabled = false; pctx.setTransform(1,0,0,1,0,0);
      pctx.clearRect(0,0,pw,ph2); pctx.drawImage(cv, 0,0,dw,dh, 0,0,pw,ph2);          // DOWN
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = "copy";
      ctx.drawImage(px.canvas, 0,0,pw,ph2, 0,0,pw*step,ph2*step); ctx.restore();        // UP (chunky)
    }
    // (a) baked curvature + corner vignette (bowed tube), then a soft center vignette
    if (cache.curve) ctx.drawImage(cache.curve, 0, 0, w, h);
    var vg = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.40, w/2,h/2, Math.max(w,h)*0.74);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.42)"); ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);
    // (b) dense scanlines
    if (opts.scanlines!==false && cache.scan) ctx.drawImage(cache.scan, 0, 0, w, h);
    // (c) rolling refresh band (a slow bright bar drifting down the tube)
    if (opts.scanlines!==false && cache.band) { var by = ((t*42) % (h + cache.bandH)) - cache.bandH;
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.drawImage(cache.band, 0, by, w, cache.bandH); ctx.restore(); }
    // (d) VHS tracking glitch — rare, brief (game pulses opts.glitch on scares/threat)
    if (opts.glitch > 0.02) { var gr = srnd(((t*1000)|0) ^ 0x5bd1), slices = 2 + (gr()*4|0);
      for (var sgl=0; sgl<slices; sgl++){ var sy=gr()*h, sh=3+gr()*18, off=(gr()-0.5)*26*opts.glitch;
        ctx.drawImage(cv, 0, sy*(cv.height/h), cv.width, sh*(cv.height/h), off, sy, w, sh); }
      var ty=gr()*h; ctx.fillStyle="rgba(220,255,235,0.10)"; ctx.fillRect(0,ty,w,2);
      ctx.fillStyle="rgba(0,0,0,0.30)"; ctx.fillRect(0,ty+2,w,1+gr()*6); }
    // (e) sanity tint (creeping sick violet-red at low mind)
    if (opts.sanity!=null && opts.sanity<0.5){ var a=(0.5-opts.sanity)*0.5;
      ctx.fillStyle="rgba(120,30,60,"+(a*0.5).toFixed(3)+")"; ctx.fillRect(0,0,w,h); }
    // (f) damage / event flash
    if (opts.flash>0){ ctx.fillStyle="rgba("+(opts.flashCol||"180,40,40")+","+Math.min(0.6,opts.flash)+")"; ctx.fillRect(0,0,w,h); }
    // (g) animated grain (cycle 3 baked frames)
    if (cache.grains){ var gi=((t*18)|0)%3; ctx.globalAlpha=0.085; ctx.drawImage(cache.grains[gi],0,0,w,h); ctx.globalAlpha=1; }
  }

  function drawTitle(ctx, w, h, t) {
    drawWater(ctx, w, h, 0.55);
    // descending sub silhouette
    var cx=w*0.5, cy=h*0.52 + Math.sin(t*0.6)*6;
    var s=Math.min(w,h)*0.16;
    var glow=ctx.createRadialGradient(cx,cy,0,cx,cy,s*3); glow.addColorStop(0,"rgba(40,120,110,0.18)"); glow.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=glow; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(0.18);
    poly(ctx, [[-s*1.6,0],[-s*1.2,-s*0.5],[s*1.1,-s*0.42],[s*1.5,0],[s*1.1,s*0.42],[-s*1.2,s*0.5]], PAL.steel, PAL.ink,2);
    poly(ctx, [[-s*1.2,-s*0.5],[s*1.1,-s*0.42],[s*0.6,-s*0.1],[-s*0.9,-s*0.12]], PAL.steelHi);
    poly(ctx, [[s*1.1,-s*0.42],[s*1.5,0],[s*1.1,s*0.42],[s*0.7,0]], PAL.steelLo);
    poly(ctx, [[-s*0.3,-s*0.5],[-s*0.1,-s*0.95],[s*0.25,-s*0.92],[s*0.2,-s*0.46]], PAL.steel, PAL.ink,1.5); // tower
    ctx.fillStyle=PAL.amberHi; for(var p=0;p<4;p++){ ctx.beginPath(); ctx.arc(-s*0.6+p*s*0.5,-s*0.05,s*0.06,0,7); ctx.fill(); }
    var prop=ctx.createRadialGradient(-s*1.5,0,0,-s*1.5,0,s*0.5); prop.addColorStop(0,"rgba(224,163,46,0.3)"); prop.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=prop; ctx.beginPath(); ctx.arc(-s*1.5,0,s*0.5,0,7); ctx.fill();
    ctx.restore();
    // marine snow handled by caller particles
  }

  // ---------- helpers ----------
  function rrect(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function wrapText(ctx, str, cx, y, maxw, size, color){
    ctx.font="bold "+size+"px 'Courier New', monospace"; ctx.textAlign="center";
    var words=String(str).split(" "), line="", lines=[];
    for (var i=0;i<words.length;i++){ var test=line?line+" "+words[i]:words[i];
      if (ctx.measureText(test).width>maxw && line){ lines.push(line); line=words[i]; } else line=test; }
    if(line) lines.push(line);
    for (var l=0;l<lines.length && l<3;l++){ ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillText(lines[l],cx+1,y+l*(size+2)+1); ctx.fillStyle=color; ctx.fillText(lines[l],cx,y+l*(size+2)); }
    return lines.length;
  }
  function mix(a,b,t){ var ca=hex(a), cb=hex(b); t=Math.max(0,Math.min(1,t));
    return "rgb("+Math.round(ca[0]+(cb[0]-ca[0])*t)+","+Math.round(ca[1]+(cb[1]-ca[1])*t)+","+Math.round(ca[2]+(cb[2]-ca[2])*t)+")"; }
  function hex(h){ h=h.replace("#",""); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }

  // ---------- Minesweeper sonar grid (crisp CRT readout over the low-res buffer) ----------
  function numColor(n) {
    return n <= 0 ? PAL.phos : n === 1 ? PAL.phosHi : n === 2 ? PAL.bio : n === 3 ? PAL.amber
      : n === 4 ? PAL.amberHi : n === 5 ? PAL.rustHi : n <= 7 ? PAL.bloodHi : "#ff5050";
  }
  function glowDot(ctx, x, y, r, col, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalAlpha = (a == null ? 1 : a) * 0.8; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 7); ctx.fill(); ctx.restore();
  }
  function textCentered(ctx, str, x, y, size, color) {
    ctx.font = "bold " + size + "px 'Courier New', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(str, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.textBaseline = "alphabetic";
  }

  // small low-poly content glyph for a loot cell / cargo readout
  function lootGlyph(ctx, x, y, s, kind, t) {
    t = t || 0; ctx.save(); ctx.translate(x, y);
    var pulse = 0.55 + 0.45 * Math.sin(t * 3 + x * 0.1);
    if (kind === "data") {
      glowDot(ctx, 0, 0, s * 0.7, PAL.bio, pulse);
      poly(ctx, [[0, -s * 0.5], [s * 0.42, 0], [0, s * 0.5], [-s * 0.42, 0]], PAL.bioHi, PAL.ink, 1);
      ctx.fillStyle = "#04120e"; ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, 7); ctx.fill();
    } else if (kind === "wreck") {
      poly(ctx, [[-s * 0.6, s * 0.2], [-s * 0.1, -s * 0.32], [s * 0.5, -s * 0.1], [s * 0.55, s * 0.35], [-s * 0.5, s * 0.45]], PAL.rust, PAL.ink, 1);
      poly(ctx, [[-s * 0.6, s * 0.2], [-s * 0.1, -s * 0.32], [-s * 0.22, s * 0.1]], PAL.rustHi);
    } else if (kind === "artifact") {
      glowDot(ctx, 0, 0, s * 0.7, PAL.bio, pulse * 0.8);
      poly(ctx, [[-s * 0.22, -s * 0.55], [s * 0.2, -s * 0.5], [s * 0.24, s * 0.5], [-s * 0.18, s * 0.55]], "#0c1016", PAL.ink, 1);
      ctx.strokeStyle = PAL.bioHi; ctx.lineWidth = 1.4; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.3); ctx.lineTo(s * 0.06, -s * 0.05); ctx.lineTo(-s * 0.02, s * 0.2); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (kind === "shard") {
      glowDot(ctx, 0, 0, s * 1.05, PAL.violetHi, pulse);
      ctx.fillStyle = PAL.bioHi;
      for (var i = 0; i < 4; i++) { var a = i / 4 * Math.PI * 2 + t * 0.6;
        poly(ctx, [[Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62], [Math.cos(a + 0.5) * s * 0.16, Math.sin(a + 0.5) * s * 0.16], [Math.cos(a - 0.5) * s * 0.16, Math.sin(a - 0.5) * s * 0.16]], PAL.bioHi); }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, 7); ctx.fill();
    } else if (kind === "vent") {
      glowDot(ctx, 0, s * 0.18, s * 0.7, PAL.phos, pulse);
      ctx.strokeStyle = PAL.phosHi; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      for (var v = 0; v < 3; v++) { var yy = s * 0.3 - v * s * 0.26; ctx.beginPath();
        ctx.moveTo(-s * 0.3, yy + s * 0.12); ctx.lineTo(0, yy - s * 0.12); ctx.lineTo(s * 0.3, yy + s * 0.12); ctx.stroke(); }
    } else if (kind === "signal") {
      glowDot(ctx, 0, 0, s * 0.55, PAL.amberHi, pulse);
      ctx.strokeStyle = PAL.amberHi; ctx.lineWidth = Math.max(1, s * 0.09);
      for (var w = 1; w <= 3; w++) { ctx.globalAlpha = (0.85 - w * 0.2) * (0.5 + 0.5 * Math.sin(t * 4 - w)); ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.22 * w, -1.0, 1.0); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = PAL.amberHi; ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.15, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawCell(ctx, x, y, s, c, t) {
    var r = Math.max(2, s * 0.12);
    if (c.revealed) {
      if (c.triggered) { // a struck monster cell
        var g = ctx.createLinearGradient(x, y, x, y + s); g.addColorStop(0, "#3a0d10"); g.addColorStop(1, "#160405");
        ctx.fillStyle = g; rrect(ctx, x, y, s, s, r); ctx.fill();
        ctx.strokeStyle = PAL.blood; ctx.lineWidth = 1.4; rrect(ctx, x, y, s, s, r); ctx.stroke();
        var cxp = x + s / 2, cyp = y + s / 2;
        poly(ctx, [[cxp - s * 0.24, cyp - s * 0.12], [cxp + s * 0.24, cyp - s * 0.12], [cxp, cyp + s * 0.28]], PAL.bloodHi);
        ctx.fillStyle = "#160405"; ctx.beginPath(); ctx.arc(cxp - s * 0.09, cyp - s * 0.05, s * 0.05, 0, 7); ctx.arc(cxp + s * 0.09, cyp - s * 0.05, s * 0.05, 0, 7); ctx.fill();
      } else { // safe revealed cell, recessed phosphor face
        ctx.fillStyle = "#06100c"; rrect(ctx, x, y, s, s, r); ctx.fill();
        ctx.strokeStyle = "rgba(24,70,54,0.7)"; ctx.lineWidth = 1; rrect(ctx, x, y, s, s, r); ctx.stroke();
        var nshow = (c.dnum != null ? c.dnum : c.n);
        if (c.loot) { lootGlyph(ctx, x + s * 0.42, y + s * 0.44, s * 0.30, c.loot, t);
          if (nshow > 0) textCentered(ctx, nshow + "", x + s * 0.80, y + s * 0.80, Math.round(s * 0.34), c.cor ? PAL.violetHi : numColor(nshow)); }
        else if (nshow > 0) textCentered(ctx, nshow + "", x + s / 2, y + s / 2, Math.round(s * 0.58), c.cor ? PAL.violetHi : numColor(nshow));
      }
    } else { // fogged faceted tile
      var gg = ctx.createLinearGradient(x, y, x, y + s); gg.addColorStop(0, PAL.steelHi); gg.addColorStop(0.5, PAL.steel); gg.addColorStop(1, PAL.steelLo);
      ctx.fillStyle = gg; rrect(ctx, x, y, s, s, r); ctx.fill();
      poly(ctx, [[x, y], [x + s, y], [x, y + s]], "rgba(255,255,255,0.06)");
      poly(ctx, [[x + s, y], [x + s, y + s], [x, y + s]], "rgba(0,0,0,0.28)");
      ctx.strokeStyle = PAL.steelLo; ctx.lineWidth = 1; rrect(ctx, x, y, s, s, r); ctx.stroke();
      if (c.flagged) {
        ctx.strokeStyle = "#7c1414"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + s * 0.33, y + s * 0.22); ctx.lineTo(x + s * 0.33, y + s * 0.8); ctx.stroke();
        poly(ctx, [[x + s * 0.33, y + s * 0.22], [x + s * 0.68, y + s * 0.34], [x + s * 0.33, y + s * 0.47]], PAL.bloodHi);
      } else if (c.peek) { // pulse-scanned: content known, not triggered
        if (ctx.setLineDash) ctx.setLineDash([3, 3]);
        ctx.strokeStyle = PAL.amberHi; ctx.lineWidth = 1.4; rrect(ctx, x + 2, y + 2, s - 4, s - 4, r); ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (c.mon) textCentered(ctx, "!", x + s / 2, y + s / 2, Math.round(s * 0.5), PAL.bloodHi);
        else if (c.loot) lootGlyph(ctx, x + s / 2, y + s / 2, s * 0.3, c.loot, t);
        else textCentered(ctx, "·", x + s / 2, y + s / 2, Math.round(s * 0.6), PAL.phosHi);
      }
    }
  }

  function drawGrid(ctx, o) {
    var cells = o.cells, gw = o.gw, gh = o.gh, cs = o.cell, gap = o.gap == null ? 2 : o.gap, x0 = o.x, y0 = o.y, t = o.time || 0;
    for (var cy = 0; cy < gh; cy++) for (var cx = 0; cx < gw; cx++) {
      var c = cells[cy * gw + cx]; if (!c) continue;
      var px = x0 + cx * (cs + gap), py = y0 + cy * (cs + gap);
      drawCell(ctx, px, py, cs, c, t);
      if (o.cursor && o.cursor.x === cx && o.cursor.y === cy) {
        ctx.strokeStyle = PAL.phosHi; ctx.lineWidth = 2; rrect(ctx, px - 1, py - 1, cs + 2, cs + 2, 3); ctx.stroke();
      }
    }
  }

  // ---------- first-person 3D forward view (Iron-Lung-style: navigate the black by instinct) ----------
  // o: { contacts:[{rx,ry,rz,kind,monShape,isMonster,known,source}], snow:[{rx,ry,rz}],
  //      lightOn, threat(0..1), time, fov, headlightRange, collectRange }
  function drawForward(ctx, bw, bh, o) {
    o = o || {}; var cx = bw / 2, cy = bh * 0.5, t = o.time || 0;
    var fov = o.fov || 1.25, focal = (bw * 0.5) / Math.tan(fov / 2);
    var range = o.headlightRange || 30, lightOn = o.lightOn;

    // clearer abyssal water — deep teal-blue, readable, not pitch black
    var bg = ctx.createLinearGradient(0, 0, 0, bh);
    bg.addColorStop(0, lightOn ? "#123843" : "#0c2632"); bg.addColorStop(0.55, "#072027"); bg.addColorStop(1, "#03121a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, bw, bh);

    // ---------- ACTUAL 3D TRENCH: a canyon corridor we descend, walls + floor receding to a vanishing point ----------
    (function () {
      var halfW = 1.02, floorY = 0.86, topY = -1.32;
      var nSlice = 18, near = 1.12, farD = Math.max(18, range * 1.3), ratio = farD / near;
      var scroll = (t * 0.8) % 1;                          // depth slices flow toward us = forward motion
      function P(wx, wy, z) { var f = focal / z; return [cx + wx * f, cy + wy * f]; }
      function fog(z) { return Math.max(0, Math.min(1, 1 - (z - near) / (farD - near))); }
      var amb = lightOn ? 0.9 : 0.52;
      function shade(z, surf) { var b = (0.16 + fog(z) * 0.84) * amb * surf;
        return "rgb(" + ((6 + 36 * b) | 0) + "," + ((20 + 66 * b) | 0) + "," + ((27 + 60 * b) | 0) + ")"; }
      var SL = [];
      for (var s = 0; s <= nSlice; s++) {
        var p = (s + scroll) / nSlice, z = near * Math.pow(ratio, p);
        var hw = halfW + Math.sin(z * 1.7) * 0.07 + Math.sin(z * 0.66 + 1.3) * 0.05;   // rocky wobble keyed to world-depth (stable as it flows)
        var ty = topY + Math.sin(z * 1.05 + 2.0) * 0.14 + Math.sin(z * 2.3) * 0.06;
        SL.push({ z: z, FL: P(-hw, floorY, z), FR: P(hw, floorY, z), TL: P(-hw, ty, z), TR: P(hw, ty, z) });
      }
      function quad(a, b, c, d, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
      for (var k = nSlice - 1; k >= 0; k--) {                  // painter: far band first
        var n0 = SL[k], f0 = SL[k + 1], fz = f0.z;
        quad(n0.FL, n0.FR, f0.FR, f0.FL, shade(fz, 1.0));      // floor
        quad(n0.FL, n0.TL, f0.TL, f0.FL, shade(fz, 0.58));     // left wall (in shadow)
        quad(n0.FR, n0.TR, f0.TR, f0.FR, shade(fz, 0.78));     // right wall (lit side)
      }
      // depth ribs + seams for crisp 3D readout
      ctx.lineCap = "round";
      for (var r2 = 0; r2 < SL.length; r2 += 1) { var sl = SL[r2], a = (0.05 + fog(sl.z) * 0.22) * amb; if (a < 0.02) continue;
        ctx.strokeStyle = "rgba(120,200,205," + a.toFixed(3) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sl.TL[0], sl.TL[1]); ctx.lineTo(sl.FL[0], sl.FL[1]); ctx.lineTo(sl.FR[0], sl.FR[1]); ctx.lineTo(sl.TR[0], sl.TR[1]); ctx.stroke(); }
      // longitudinal seams (floor/wall edges + a floor centre channel) running to the vanishing point
      ctx.strokeStyle = "rgba(110,190,195,0.16)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(SL[0].FL[0], SL[0].FL[1]); ctx.lineTo(SL[nSlice].FL[0], SL[nSlice].FL[1]);
      ctx.moveTo(SL[0].FR[0], SL[0].FR[1]); ctx.lineTo(SL[nSlice].FR[0], SL[nSlice].FR[1]); ctx.stroke();
      // murk swallowing the deep end (vanishing-point haze)
      var vp = SL[nSlice], hz = ctx.createRadialGradient((vp.FL[0] + vp.FR[0]) / 2, (vp.FL[1] + vp.TL[1]) / 2, 2, (vp.FL[0] + vp.FR[0]) / 2, (vp.FL[1] + vp.TL[1]) / 2, bh * 0.5);
      hz.addColorStop(0, lightOn ? "rgba(14,52,60,0.9)" : "rgba(6,28,36,0.92)"); hz.addColorStop(1, "rgba(6,28,36,0)");
      ctx.fillStyle = hz; ctx.fillRect(0, 0, bw, bh);
    })();

    // god-rays slanting from the surface
    ctx.save(); ctx.globalAlpha = lightOn ? 0.12 : 0.07;
    for (var gr = 0; gr < 4; gr++) { var rxp = bw * (0.18 + gr * 0.22) + Math.sin(t * 0.2 + gr) * bw * 0.03;
      var rg = ctx.createLinearGradient(rxp, 0, rxp - bw * 0.12, bh); rg.addColorStop(0, "rgba(160,205,210,0.55)"); rg.addColorStop(1, "rgba(160,205,210,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(rxp, 0); ctx.lineTo(rxp + bw * 0.05, 0); ctx.lineTo(rxp - bw * 0.09, bh); ctx.lineTo(rxp - bw * 0.16, bh); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // distance darkening
    var vg = ctx.createRadialGradient(cx, cy * 0.92, bh * 0.08, cx, cy, bh * 0.95); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(1,8,12,0.62)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, bw, bh);
    // headlight cone
    if (lightOn) {
      var lg = ctx.createRadialGradient(cx, cy - bh * 0.05, 2, cx, cy, bh * 0.82);
      lg.addColorStop(0, "rgba(175,220,225,0.30)"); lg.addColorStop(0.5, "rgba(95,135,145,0.10)"); lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(cx, cy - bh * 0.05); ctx.lineTo(cx - bw * 0.5, bh); ctx.lineTo(cx + bw * 0.5, bh); ctx.closePath(); ctx.fill();
    }
    // marine snow (motion cue)
    var snow = o.snow || [];
    for (var i = 0; i < snow.length; i++) { var p = snow[i]; if (p.rz <= 0.4) continue;
      var sx = cx + (p.rx / p.rz) * focal, sy = cy + (p.ry / p.rz) * focal; if (sx < -4 || sx > bw + 4 || sy < -4 || sy > bh + 4) continue;
      var sz = Math.max(0.5, 2.4 / p.rz * 6), fog = Math.max(0, 1 - p.rz / (range * 1.5)), a = (lightOn ? 0.55 : 0.24) * fog;
      if (a <= 0.01) continue; ctx.fillStyle = "rgba(190,215,210," + a.toFixed(3) + ")"; ctx.fillRect(sx, sy, sz, sz); }
    // contacts far->near
    var cs = (o.contacts || []).slice().sort(function (a, b) { return b.rz - a.rz; });
    for (var c = 0; c < cs.length; c++) {
      var k = cs[c]; if (k.rz <= 0.6) continue;
      var x = cx + (k.rx / k.rz) * focal, y = cy + (k.ry / k.rz) * focal; if (x < -bw * 0.4 || x > bw * 1.4) continue;
      var fog2 = Math.max(0, 1 - k.rz / range), sz2 = Math.min(bh * 0.8, (focal * 1.7) / k.rz);
      if (k.isMonster) {
        var seen = lightOn ? Math.max(fog2, 0.4) : (k.rz < 16 ? (16 - k.rz) / 16 * 0.7 : 0.05);
        // NEVER a creature model — only a vast dark mass moving in the trench ahead
        var fsz = (k.monShape === "mutationKing" ? sz2 * 1.5 : sz2 * 0.95);
        drawShadowMass(ctx, x, y, fsz, { t: t + k.rz, lit: seen * 0.7, elong: k.monShape === "mutationKing" ? 1.5 : 1.1 });
      } else {
        var glowSeen = lightOn ? fog2 : (k.rz < 22 ? Math.max(0, (22 - k.rz) / 22) * 0.4 : 0); if (glowSeen <= 0.02) continue;
        var col = k.kind === "vent" ? PAL.phos : k.kind === "source" ? PAL.violetHi : k.kind === "artifact" ? PAL.bio : PAL.bioHi;
        ctx.save(); ctx.globalAlpha = Math.min(1, glowSeen + 0.12); glowDot(ctx, x, y, Math.max(4, sz2 * 0.22), col, 1); ctx.restore();
        if ((lightOn && fog2 > 0.05) || k.kind === "source") { ctx.save(); ctx.globalAlpha = Math.min(1, (k.kind === "source" ? 0.85 : fog2) + 0.12);
          lootGlyph(ctx, x, y, Math.min(bh * 0.3, sz2 * 0.32), k.kind === "source" ? "shard" : k.kind === "vent" ? "vent" : k.kind === "artifact" ? "artifact" : "data", t); ctx.restore(); }
      }
    }
    // forward reticle
    ctx.strokeStyle = "rgba(120,255,210,0.16)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
  }

  // ---------- DIEGETIC instruments (no text/bars — physical gauges + a leaking hull) ----------

  // a real oxygen tank: vertical pressure cylinder whose liquid/charge level drops
  function drawOxygenTank(ctx, x, y, w, h, frac, t) {
    frac = Math.max(0, Math.min(1, frac)); t = t || 0;
    var r = w * 0.42;
    // steel body
    var body = ctx.createLinearGradient(x, y, x + w, y);
    body.addColorStop(0, PAL.steelLo); body.addColorStop(0.3, PAL.steelHi); body.addColorStop(0.55, PAL.steel); body.addColorStop(1, "#0d1116");
    ctx.fillStyle = body; rrect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = "#05080c"; ctx.lineWidth = 2; rrect(ctx, x, y, w, h, r); ctx.stroke();
    // valve cap on top
    ctx.fillStyle = PAL.steelHi; rrect(ctx, x + w * 0.3, y - h * 0.06, w * 0.4, h * 0.06, 2); ctx.fill();
    ctx.fillStyle = PAL.rivet; ctx.fillRect(x + w * 0.44, y - h * 0.11, w * 0.12, h * 0.06);
    // engraved nameplate + a bourdon mini pressure dial on the cap (corroborates the liquid column)
    text(ctx, "КИСЛОРОД", x + w * 0.5, y + h * 0.05, Math.max(6, w * 0.17), PAL.amber, "center");
    var dcx = x + w * 0.5, dcy = y - h * 0.10, dr = w * 0.16;
    ctx.fillStyle = "#0b0e12"; ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, 7); ctx.fill();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1; ctx.stroke();
    var da0 = Math.PI * 0.78, da1 = Math.PI * 2.22;
    for (var dk = 0; dk <= 6; dk++) { var dka = da0 + (da1 - da0) * dk / 6; ctx.strokeStyle = dk >= 5 ? PAL.blood : "rgba(170,190,190,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dcx + Math.cos(dka) * dr * 0.7, dcy + Math.sin(dka) * dr * 0.7); ctx.lineTo(dcx + Math.cos(dka) * dr * 0.92, dcy + Math.sin(dka) * dr * 0.92); ctx.stroke(); }
    var dna = da0 + (da1 - da0) * frac;
    ctx.strokeStyle = frac < 0.28 ? PAL.bloodHi : PAL.amberHi; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(dcx, dcy); ctx.lineTo(dcx + Math.cos(dna) * dr * 0.78, dcy + Math.sin(dna) * dr * 0.78); ctx.stroke();
    ctx.fillStyle = PAL.amber; ctx.beginPath(); ctx.arc(dcx, dcy, dr * 0.12, 0, 7); ctx.fill();
    // glass sight-gauge down the middle
    var gx = x + w * 0.34, gw = w * 0.32, gy = y + h * 0.10, gh = h * 0.82;
    ctx.fillStyle = "#03070b"; rrect(ctx, gx, gy, gw, gh, gw * 0.3); ctx.fill();
    ctx.save(); rrect(ctx, gx, gy, gw, gh, gw * 0.3); ctx.clip();
    var lvlY = gy + gh * (1 - frac);
    var low = frac < 0.28;
    var liq = low ? (frac < 0.14 ? PAL.bloodHi : PAL.amber) : PAL.bio;
    var lg = ctx.createLinearGradient(gx, lvlY, gx, gy + gh);
    lg.addColorStop(0, liq); lg.addColorStop(1, low ? "#3a1208" : "#063a2c");
    ctx.fillStyle = lg; ctx.fillRect(gx, lvlY, gw, gy + gh - lvlY);
    // wavy meniscus
    ctx.fillStyle = low ? PAL.amberHi : PAL.bioHi; ctx.beginPath(); ctx.moveTo(gx, lvlY);
    for (var i = 0; i <= 6; i++) ctx.lineTo(gx + gw * i / 6, lvlY + Math.sin(t * 3 + i) * 1.5);
    ctx.lineTo(gx + gw, lvlY + 3); ctx.lineTo(gx, lvlY + 3); ctx.closePath(); ctx.fill();
    // bubbles
    for (var b = 0; b < 5; b++) { var by = gy + gh - ((t * (10 + b * 4) + b * 30) % gh); if (by < lvlY) continue; ctx.fillStyle = "rgba(180,255,230,0.5)"; ctx.beginPath(); ctx.arc(gx + gw * (0.2 + 0.6 * ((b * 37) % 100) / 100), by, 1.2, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = "rgba(120,150,150,0.5)"; ctx.lineWidth = 1; rrect(ctx, gx, gy, gw, gh, gw * 0.3); ctx.stroke();
    // tick marks
    ctx.strokeStyle = "rgba(150,170,170,0.5)"; for (var k = 0; k <= 4; k++) { var ty = gy + gh * k / 4; ctx.beginPath(); ctx.moveTo(gx - 3, ty); ctx.lineTo(gx, ty); ctx.moveTo(gx + gw, ty); ctx.lineTo(gx + gw + 3, ty); ctx.stroke(); }
    // low-air warning glow
    if (low) { var p = 0.5 + 0.5 * Math.sin(t * 6); ctx.save(); ctx.globalAlpha = p * 0.5; glowDot(ctx, x + w / 2, y + h * 0.5, w * 0.7, frac < 0.14 ? PAL.bloodHi : PAL.amberHi, 1); ctx.restore(); }
  }

  // authentic riveted depth manometer — ГЛУБИНА, layer numerals, danger band, counterweighted needle
  function drawDepthGauge(ctx, cx, cy, r, frac, t) {
    frac = Math.max(0, Math.min(1, frac)); t = t || 0;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, 7); ctx.fillStyle = PAL.steelLo; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = PAL.steel; ctx.stroke();
    ctx.fillStyle = PAL.rivet; for (var bi = 0; bi < 6; bi++) { var ba = bi / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * (r + 5), cy + Math.sin(ba) * (r + 5), Math.max(1.1, r * 0.07), 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = "#0b0e12"; ctx.fill();
    var a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, span = a1 - a0;
    ctx.strokeStyle = "rgba(150,30,30,0.5)"; ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.beginPath(); ctx.arc(cx, cy, r - r * 0.08, a0 + span * (4 / 6), a1); ctx.stroke();
    for (var i = 0; i <= 12; i++) { var a = a0 + span * i / 12, maj = (i % 2) === 0, deep = i >= 8;
      ctx.strokeStyle = deep ? PAL.blood : "rgba(170,190,190,0.7)"; ctx.lineWidth = maj ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - (maj ? 7 : 4)), cy + Math.sin(a) * (r - (maj ? 7 : 4))); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
      if (maj) { var num = i / 2; ctx.fillStyle = num >= 5 ? PAL.bloodHi : "rgba(180,200,200,0.75)"; ctx.font = "bold " + Math.max(6, r * 0.22) + "px 'Courier New', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(num + "", cx + Math.cos(a) * (r - r * 0.30), cy + Math.sin(a) * (r - r * 0.30)); } }
    ctx.textBaseline = "alphabetic";
    text(ctx, "ГЛУБИНА", cx, cy - r * 0.30, Math.max(6, r * 0.19), PAL.amber, "center");
    text(ctx, Math.round(frac * 5200) + "", cx, cy + r * 0.46, Math.max(6, r * 0.22), PAL.phosHi, "center");
    text(ctx, "М", cx, cy + r * 0.66, Math.max(5, r * 0.16), PAL.textDim, "center");
    var na = a0 + span * frac;
    ctx.strokeStyle = PAL.amberHi; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * r * 0.22, cy - Math.sin(na) * r * 0.22); ctx.lineTo(cx + Math.cos(na) * (r - 8), cy + Math.sin(na) * (r - 8)); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = PAL.amber; ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.steelHi; ctx.beginPath(); ctx.arc(cx, cy, r * 0.05, 0, 7); ctx.fill();
    var gl = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gl.addColorStop(0, "rgba(180,220,230,0.10)"); gl.addColorStop(0.5, "rgba(0,0,0,0)"); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(120,255,210,0.06)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  }

  // a blinking warning lamp
  function drawWarnLamp(ctx, x, y, r, on, col, t) {
    col = col || PAL.bloodHi;
    ctx.fillStyle = PAL.steelLo; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.fill();
    var p = on ? (0.4 + 0.6 * Math.abs(Math.sin(t * 7))) : 0.08;
    if (on) { ctx.save(); ctx.globalAlpha = p * 0.7; glowDot(ctx, x, y, r * 2.4, col, 1); ctx.restore(); }
    ctx.fillStyle = on ? mix("#220505", col, p) : "#1a1d22"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#05080c"; ctx.lineWidth = 1; ctx.stroke();
  }

  // hull breach made visible: progressive water ingress over the whole screen (no health bar)
  // sev 0..1 = how breached the hull is (1 = catastrophic)
  function drawLeak(ctx, w, h, sev, t) {
    if (sev <= 0.001) return; t = t || 0;
    ctx.save();
    // edge streams from the top — more + faster as sev rises
    var streams = Math.floor(sev * 9);
    for (var i = 0; i < streams; i++) {
      var sx = ((i * 137 + 40) % 100) / 100 * w;
      var len = h * (0.25 + 0.65 * ((i * 53) % 100) / 100) * (0.5 + sev);
      var ww = 1 + sev * 2.5;
      var grd = ctx.createLinearGradient(sx, 0, sx, len);
      grd.addColorStop(0, "rgba(120,190,200,0.45)"); grd.addColorStop(1, "rgba(60,110,120,0.0)");
      ctx.fillStyle = grd; ctx.fillRect(sx, 0, ww, len);
      // running droplet
      var dy = (t * (120 + i * 30)) % (len + 30);
      ctx.fillStyle = "rgba(200,235,240,0.6)"; ctx.fillRect(sx - 0.5, dy, ww + 1, 4 + sev * 4);
    }
    // condensation specks
    if (sev > 0.3) { ctx.fillStyle = "rgba(180,210,215,0.25)"; for (var c = 0; c < sev * 30; c++) { var px = ((c * 71) % 100) / 100 * w, py = ((c * 167) % 100) / 100 * h * 0.6; ctx.fillRect(px, py, 1.5, 1.5); } }
    // corner cracks with light leaking, at high sev
    if (sev > 0.45) {
      ctx.strokeStyle = "rgba(150,200,210," + (0.3 + sev * 0.4).toFixed(2) + ")"; ctx.lineWidth = 1.4;
      var corners = [[0, 0], [w, 0], [0, h], [w, h]];
      for (var cc = 0; cc < corners.length; cc++) { var ox = corners[cc][0], oy = corners[cc][1], dx = ox === 0 ? 1 : -1, dy = oy === 0 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * w * 0.12, oy + dy * h * 0.04); ctx.lineTo(ox + dx * w * 0.07, oy + dy * h * 0.14); ctx.lineTo(ox + dx * w * 0.18, oy + dy * h * 0.20); ctx.stroke(); }
    }
    // rising flood at the bottom
    var flood = h * 0.22 * sev * (sev > 0.5 ? 1.5 : 1);
    if (flood > 1) {
      var fy = h - flood;
      var fg = ctx.createLinearGradient(0, fy, 0, h); fg.addColorStop(0, "rgba(40,90,100,0.35)"); fg.addColorStop(1, "rgba(15,45,55,0.6)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(0, fy);
      for (var x2 = 0; x2 <= w; x2 += w / 12) ctx.lineTo(x2, fy + Math.sin(x2 * 0.03 + t * 2.5) * 4);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      // surface shimmer
      ctx.strokeStyle = "rgba(170,220,225,0.4)"; ctx.lineWidth = 1; ctx.beginPath();
      for (var x3 = 0; x3 <= w; x3 += w / 12) { var yy = fy + Math.sin(x3 * 0.03 + t * 2.5) * 4; if (x3 === 0) ctx.moveTo(x3, yy); else ctx.lineTo(x3, yy); } ctx.stroke();
    }
    // alarm vignette + spark flashes at high sev
    if (sev > 0.55) {
      var ap = 0.5 + 0.5 * Math.sin(t * 8);
      var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(150,20,25," + (0.25 * ap * sev).toFixed(3) + ")");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      if (Math.sin(t * 13) > 0.93) { ctx.fillStyle = "rgba(255,240,200,0.25)"; ctx.fillRect(0, 0, w, h * 0.12); }
    }
    ctx.restore();
  }

  // ---------- real 3D Angler (software mesh renderer: perspective + painter's algorithm + flat shading) ----------
  function v3norm(a) { var m = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; }
  function v3sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function v3cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function rot3(v, yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
    return [x, y * cp - z * sp, y * sp + z * cp];
  }
  var _angler = null;
  function anglerMesh() {
    if (_angler) return _angler;
    var nz = 9, ns = 12, rings = [];
    for (var i = 0; i < nz; i++) {
      var u = i / (nz - 1), z = -1.3 + u * 2.05;
      var r = 0.1 + 0.82 * Math.pow(Math.sin(Math.min(1, u * 0.92) * Math.PI), 0.62);
      var ring = []; for (var j = 0; j < ns; j++) { var a = j / ns * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r * 0.82 - r * 0.06, z]); }
      rings.push(ring);
    }
    var faces = [];
    for (var i2 = 0; i2 < nz - 1; i2++) for (var j2 = 0; j2 < ns; j2++) { var jb = (j2 + 1) % ns; faces.push([rings[i2][j2], rings[i2][jb], rings[i2 + 1][jb], rings[i2 + 1][j2]]); }
    _angler = { faces: faces, headZ: 0.75, headR: rings[nz - 1][0] ? 0.12 : 0.12 };
    return _angler;
  }
  // o: { yaw, pitch, mouth(0..1), t, lit(0..1) }
  function drawAngler3D(ctx, cx, cy, size, o) {
    o = o || {}; var yaw = o.yaw || 0, pitch = o.pitch || 0, mouth = o.mouth == null ? 0.25 : o.mouth, t = o.t || 0, lit = o.lit == null ? 1 : o.lit, camZ = 3.05;
    var M = anglerMesh(), light = v3norm([0.22, 0.55, -0.8]);
    function tp(v) { var r = rot3(v, yaw, pitch); var z = r[2] + camZ; if (z < 0.25) z = 0.25; var f = size / z; return [cx + r[0] * f, cy - r[1] * f, z, r]; }
    var LO = [8, 15, 18], HI = [44, 72, 78]; // dark wet flesh — never bright
    var drawn = [], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (var i = 0; i < M.faces.length; i++) { var f = M.faces[i]; var p = [tp(f[0]), tp(f[1]), tp(f[2]), tp(f[3])];
      var n = v3norm(v3cross(v3sub(p[1][3], p[0][3]), v3sub(p[2][3], p[0][3])));
      var sh = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      for (var b = 0; b < 4; b++) { if (p[b][0] < minx) minx = p[b][0]; if (p[b][0] > maxx) maxx = p[b][0]; if (p[b][1] < miny) miny = p[b][1]; if (p[b][1] > maxy) maxy = p[b][1]; }
      drawn.push({ p: p, z: (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4, sh: sh }); }
    drawn.sort(function (a, b) { return b.z - a.z; });
    // fill smooth (no facet edges) — overlap slightly to hide seams
    for (var d2 = 0; d2 < drawn.length; d2++) { var dn = drawn[d2], k = (0.14 + dn.sh * dn.sh * 0.86) * (0.42 + lit * 0.58);
      ctx.fillStyle = "rgb(" + Math.round(LO[0] + (HI[0] - LO[0]) * k) + "," + Math.round(LO[1] + (HI[1] - LO[1]) * k) + "," + Math.round(LO[2] + (HI[2] - LO[2]) * k) + ")";
      ctx.beginPath(); ctx.moveTo(dn.p[0][0], dn.p[0][1]); for (var q2 = 1; q2 < 4; q2++) ctx.lineTo(dn.p[q2][0], dn.p[q2][1]); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
    // silhouette fades into the black water (emerging from the deep)
    var bcx = (minx + maxx) / 2, bcy = (miny + maxy) / 2, br = Math.max(maxx - minx, maxy - miny) * 0.62;
    var vg = ctx.createRadialGradient(bcx, bcy, br * 0.4, bcx, bcy, br); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(2,5,7," + (0.62 + (1 - lit) * 0.36).toFixed(2) + ")");
    ctx.save(); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(bcx, bcy, br, 0, 7); ctx.fill(); ctx.restore();
    // ---- gaping maw: black throat, deep red glow, long uneven teeth ----
    var head = tp([0, -0.02, M.headZ]), rim = tp([0, 0.5, M.headZ]);
    var R = Math.max(5, Math.abs(head[1] - rim[1]) * 1.12), open = R * (0.3 + mouth * 1.7);
    ctx.save(); ctx.translate(head[0], head[1]);
    var mg = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 1.25); mg.addColorStop(0, "#000000"); mg.addColorStop(0.6, "#070103"); mg.addColorStop(1, "rgba(4,1,2,0)");
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.02, open, 0, 0, 7); ctx.fill();
    var rg = ctx.createRadialGradient(0, open * 0.18, 1, 0, open * 0.18, R * 0.7); rg.addColorStop(0, "rgba(150,18,22," + (0.28 + mouth * 0.4).toFixed(2) + ")"); rg.addColorStop(1, "rgba(70,4,8,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(0, open * 0.18, R * 0.58, open * 0.5, 0, 0, 7); ctx.fill();
    var nt = 11;
    for (var tn = 0; tn < nt; tn++) { var u = tn / (nt - 1), fx = (u - 0.5) * 1.85 * R;
      var lnU = R * (0.3 + 0.5 * Math.abs(Math.sin(tn * 12.99))), lnL = R * (0.3 + 0.5 * Math.abs(Math.sin(tn * 7.13 + 1.7)));
      var col = tn % 2 ? "#cbc2ad" : "#b3aa94";
      poly(ctx, [[fx - R * 0.05, -open * 0.97], [fx + R * 0.05, -open * 0.97], [fx + (u - 0.5) * R * 0.25, -open * 0.97 + lnU]], col);
      poly(ctx, [[fx - R * 0.05, open * 0.97], [fx + R * 0.05, open * 0.97], [fx + (u - 0.5) * R * 0.25, open * 0.97 - lnL]], col);
    }
    ctx.restore();
    // ---- small dead eyes (dim, pale — not glowing orbs) ----
    var e1 = tp([-0.25, 0.27, 0.44]), e2 = tp([0.25, 0.27, 0.44]), er = Math.max(1.5, R * 0.085);
    ctx.fillStyle = "rgba(150,162,150," + (0.45 * lit + 0.18).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(e1[0], e1[1], er, 0, 7); ctx.arc(e2[0], e2[1], er, 0, 7); ctx.fill();
    ctx.fillStyle = "#020304"; ctx.beginPath(); ctx.arc(e1[0], e1[1], er * 0.5, 0, 7); ctx.arc(e2[0], e2[1], er * 0.5, 0, 7); ctx.fill();
    // ---- lure: the single bright focal point in all that dark ----
    var brow = tp([0, 0.55, 0.4]), tip = tp([0, 1.18 + Math.sin(t * 2) * 0.07, 0.82]);
    ctx.strokeStyle = "#0c1216"; ctx.lineWidth = Math.max(1.5, R * 0.05); ctx.beginPath(); ctx.moveTo(brow[0], brow[1]); ctx.quadraticCurveTo(brow[0] + (tip[0] - brow[0]) * 0.4, brow[1] - R * 0.75, tip[0], tip[1]); ctx.stroke();
    var lb = Math.max(2.5, R * 0.15); glowDot(ctx, tip[0], tip[1], lb * 3.4, PAL.bioHi, 0.7 + 0.3 * Math.sin(t * 5));
    ctx.fillStyle = "#eafff4"; ctx.beginPath(); ctx.arc(tip[0], tip[1], lb, 0, 7); ctx.fill();
  }

  // ---------- THE BLOOP — a colossal 3D horror (its own mesh: huge, pale, many-eyed, tendrilled) ----------
  var _bloop = null;
  function bloopMesh() {
    if (_bloop) return _bloop;
    var nz = 10, ns = 14, rings = [];
    for (var i = 0; i < nz; i++) {
      var u = i / (nz - 1), z = -1.25 + u * 2.0;
      var r = 0.16 + 0.96 * Math.sin(Math.min(1, u * 0.98) * Math.PI);
      var ring = []; for (var j = 0; j < ns; j++) { var a = j / ns * Math.PI * 2; var rr = r * (1 + 0.1 * Math.sin(a * 3 + i * 0.7) + 0.06 * Math.cos(a * 5 - i)); ring.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.94, z]); }
      rings.push(ring);
    }
    var faces = [];
    for (var i2 = 0; i2 < nz - 1; i2++) for (var j2 = 0; j2 < ns; j2++) { var jb = (j2 + 1) % ns; faces.push([rings[i2][j2], rings[i2][jb], rings[i2 + 1][jb], rings[i2 + 1][j2]]); }
    _bloop = { faces: faces, headZ: 0.85 };
    return _bloop;
  }
  function drawBloop3D(ctx, cx, cy, size, o) {
    o = o || {}; var yaw = o.yaw || 0, pitch = o.pitch || 0, mouth = o.mouth == null ? 0.3 : o.mouth, t = o.t || 0, lit = o.lit == null ? 1 : o.lit, camZ = 3.2;
    var M = bloopMesh(), light = v3norm([0.26, 0.5, -0.82]);
    function tp(v) { var r = rot3(v, yaw, pitch); var z = r[2] + camZ; if (z < 0.25) z = 0.25; var f = size / z; return [cx + r[0] * f, cy - r[1] * f, z, r]; }
    // sickly dead-flesh: almost black in shadow, only the crests catch a cold pallor — never the old candy-purple
    var LO = [9, 13, 13], HI = [74, 84, 78];
    // heavy, dark tendrils sinking into the black behind the body
    ctx.save(); ctx.lineCap = "round";
    for (var td = 0; td < 8; td++) { var ba = (td / 8 - 0.5) * 2.4; var base = tp([Math.cos(ba) * 0.55, -0.85, 0.05]); var sway = Math.sin(t * 0.9 + td * 1.3) * size * 0.26;
      var midx = base[0] + sway, tipx = base[0] + sway * 1.7 + (td - 3.5) * size * 0.05, tipy = base[1] + size * (0.9 + 0.45 * Math.abs(Math.sin(t * 0.8 + td)));
      ctx.strokeStyle = "rgba(14,22,22," + (0.55 * lit + 0.25).toFixed(2) + ")"; ctx.lineWidth = Math.max(2, size * 0.05 * (1 - td / 16));
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.quadraticCurveTo(midx, base[1] + size * 0.45, tipx, tipy); ctx.stroke(); }
    ctx.restore();
    // body — smooth (stroke==fill hides facets), track bbox for the edge-darkening
    var drawn = [], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (var i = 0; i < M.faces.length; i++) { var f = M.faces[i]; var p = [tp(f[0]), tp(f[1]), tp(f[2]), tp(f[3])];
      var n = v3norm(v3cross(v3sub(p[1][3], p[0][3]), v3sub(p[2][3], p[0][3])));
      var sh = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      for (var b = 0; b < 4; b++) { if (p[b][0] < minx) minx = p[b][0]; if (p[b][0] > maxx) maxx = p[b][0]; if (p[b][1] < miny) miny = p[b][1]; if (p[b][1] > maxy) maxy = p[b][1]; }
      drawn.push({ p: p, z: (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4, sh: sh }); }
    drawn.sort(function (a, b) { return b.z - a.z; });
    for (var d2 = 0; d2 < drawn.length; d2++) { var dn = drawn[d2], k = (0.1 + dn.sh * dn.sh * 0.9) * (0.34 + lit * 0.66);
      ctx.fillStyle = "rgb(" + Math.round(LO[0] + (HI[0] - LO[0]) * k) + "," + Math.round(LO[1] + (HI[1] - LO[1]) * k) + "," + Math.round(LO[2] + (HI[2] - LO[2]) * k) + ")";
      ctx.beginPath(); ctx.moveTo(dn.p[0][0], dn.p[0][1]); for (var q = 1; q < 4; q++) ctx.lineTo(dn.p[q][0], dn.p[q][1]); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
    // the colossus dissolves into the black at its edges — only a core mass is ever lit (sense of vast unseen scale)
    var bcx = (minx + maxx) / 2, bcy = (miny + maxy) / 2, br = Math.max(maxx - minx, maxy - miny) * 0.66;
    var bv = ctx.createRadialGradient(bcx, bcy, br * 0.32, bcx, bcy, br); bv.addColorStop(0, "rgba(0,0,0,0)"); bv.addColorStop(1, "rgba(1,4,5," + (0.74 + (1 - lit) * 0.24).toFixed(2) + ")");
    ctx.save(); ctx.fillStyle = bv; ctx.beginPath(); ctx.arc(bcx, bcy, br, 0, 7); ctx.fill(); ctx.restore();
    // ---- cavernous maw: a black pit, dim blood-glow far down its throat, long uneven fangs ----
    var head = tp([0, -0.05, M.headZ]), rim = tp([0, 0.6, M.headZ]); var R = Math.max(6, Math.abs(head[1] - rim[1]) * 1.2);
    var open = R * (0.45 + mouth * 1.7);
    ctx.save(); ctx.translate(head[0], head[1]);
    var mg = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 1.35); mg.addColorStop(0, "#000000"); mg.addColorStop(0.62, "#060103"); mg.addColorStop(1, "rgba(4,1,2,0)");
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.04, open, 0, 0, 7); ctx.fill();
    var rgg = ctx.createRadialGradient(0, open * 0.2, 1, 0, open * 0.2, R * 0.78); rgg.addColorStop(0, "rgba(135,16,26," + (0.24 + mouth * 0.42).toFixed(2) + ")"); rgg.addColorStop(1, "rgba(60,4,8,0)");
    ctx.fillStyle = rgg; ctx.beginPath(); ctx.ellipse(0, open * 0.2, R * 0.6, open * 0.52, 0, 0, 7); ctx.fill();
    var teeth = 13;
    for (var tn = 0; tn < teeth; tn++) { var u = tn / (teeth - 1), fx = (u - 0.5) * 1.9 * R;
      var lnU = R * (0.26 + 0.62 * Math.abs(Math.sin(tn * 12.99 + 0.4))), lnL = R * (0.26 + 0.62 * Math.abs(Math.sin(tn * 7.13 + 2.1)));
      var col = tn % 2 ? "#c7bca6" : "#aea48e";
      poly(ctx, [[fx - R * 0.045, -open * 0.98], [fx + R * 0.045, -open * 0.98], [fx + (u - 0.5) * R * 0.3, -open * 0.98 + lnU]], col);
      poly(ctx, [[fx - R * 0.045, open * 0.98], [fx + R * 0.045, open * 0.98], [fx + (u - 0.5) * R * 0.3, open * 0.98 - lnL]], col);
    }
    ctx.restore();
    // ---- a scatter of huge, dim, dead eyes — asymmetric, sunken, milky (not a tidy glowing ring) ----
    var eyePos = [[-0.46, 0.5, 0.42, 1.0], [0.28, 0.6, 0.5, 0.7], [0.55, 0.34, 0.32, 0.85], [-0.2, 0.3, 0.58, 0.55], [0.08, 0.74, 0.46, 0.45]];
    for (var e = 0; e < eyePos.length; e++) { var ep = tp(eyePos[e]); var es = eyePos[e][3], er = Math.max(1.6, R * 0.075 * (0.7 + es)); var bl = 0.4 + 0.35 * Math.sin(t * 1.3 + e * 2.1);
      // sunken socket
      ctx.fillStyle = "rgba(4,7,7,0.85)"; ctx.beginPath(); ctx.arc(ep[0], ep[1], er * 1.7, 0, 7); ctx.fill();
      // milky dead sclera with only a faint sick glow
      glowDot(ctx, ep[0], ep[1], er * 1.8, "#3a5a4e", (0.2 * lit + 0.1) * bl * es);
      ctx.fillStyle = "rgba(150,162,150," + (0.4 * lit + 0.16).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(ep[0], ep[1], er, 0, 7); ctx.fill();
      // dead vertical slit pupil
      ctx.fillStyle = "#020403"; ctx.beginPath(); ctx.ellipse(ep[0], ep[1], er * 0.32, er * 0.78, 0, 0, 7); ctx.fill();
    }
  }

  // ---------- cute cabin plushies (morale decor) ----------
  function drawPlushie(ctx, x, y, s, id, col, t) {
    t = t || 0; col = col || PAL.amber; ctx.save(); ctx.translate(x, y + Math.sin(t * 1.5 + x) * s * 0.04);
    // hanging string
    ctx.strokeStyle = "rgba(180,190,200,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.lineTo(0, -s * 0.6); ctx.stroke();
    function eyes(ex, ey, er) { ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(-ex, ey, er, 0, 7); ctx.arc(ex, ey, er, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-ex + er * 0.3, ey - er * 0.3, er * 0.35, 0, 7); ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.35, 0, 7); ctx.fill(); }
    if (id === "duck") {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.55, s * 0.42, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.2, s * 0.36, 0, 7); ctx.fill();
      ctx.fillStyle = "#e8702a"; poly(ctx, [[s * 0.45, -s * 0.22], [s * 0.78, -s * 0.12], [s * 0.45, -s * 0.02]], "#e8702a"); eyes(s * 0.08, -s * 0.28, s * 0.06); ctx.translate(s * 0.2, -s * 0.2);
    } else if (id === "bear") {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-s * 0.32, -s * 0.32, s * 0.16, 0, 7); ctx.arc(s * 0.32, -s * 0.32, s * 0.16, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, s * 0.25, s * 0.42, s * 0.4, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.38, 0, 7); ctx.fill();
      ctx.fillStyle = mix(col, "#000", 0.25); ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.16, 0, 7); ctx.fill(); eyes(s * 0.14, -s * 0.24, s * 0.055); ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.05, 0, 7); ctx.fill();
    } else if (id === "angler") {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#0b1418"; poly(ctx, [[-s * 0.1, s * 0.08], [s * 0.5, -s * 0.05], [s * 0.45, s * 0.3]], "#0b1418");
      ctx.fillStyle = PAL.boneHi; for (var i = 0; i < 4; i++) { var tx = s * (0.05 + i * 0.1); poly(ctx, [[tx, s * 0.05], [tx + s * 0.02, s * 0.05], [tx + s * 0.01, s * 0.16]], PAL.boneHi); }
      ctx.strokeStyle = "#2a3a30"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.3); ctx.quadraticCurveTo(-s * 0.5, -s * 0.7, -s * 0.3, -s * 0.7); ctx.stroke(); glowDot(ctx, -s * 0.3, -s * 0.72, s * 0.14, PAL.bioHi, 1); eyes(s * 0.05, -s * 0.12, s * 0.06);
    } else if (id === "squid") {
      ctx.fillStyle = col; poly(ctx, [[-s * 0.3, -s * 0.5], [s * 0.3, -s * 0.5], [s * 0.22, s * 0.1], [-s * 0.22, s * 0.1]], col, PAL.ink, 1);
      ctx.strokeStyle = col; ctx.lineWidth = s * 0.08; ctx.lineCap = "round"; for (var tt = 0; tt < 5; tt++) { var ox = -s * 0.18 + tt * s * 0.09; ctx.beginPath(); ctx.moveTo(ox, s * 0.05); ctx.quadraticCurveTo(ox + Math.sin(t * 2 + tt) * s * 0.1, s * 0.4, ox + Math.sin(t * 2 + tt) * s * 0.16, s * 0.6); ctx.stroke(); }
      eyes(s * 0.12, -s * 0.2, s * 0.08);
    } else { // jelly
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.45, s * 0.38, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.1); ctx.lineTo(s * 0.45, -s * 0.1); ctx.lineTo(s * 0.36, s * 0.0); ctx.lineTo(-s * 0.36, 0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = s * 0.05; for (var j = 0; j < 5; j++) { var jx = -s * 0.3 + j * s * 0.15; ctx.beginPath(); ctx.moveTo(jx, 0); ctx.quadraticCurveTo(jx + Math.sin(t * 3 + j) * s * 0.08, s * 0.5, jx, s * 0.7); ctx.stroke(); }
      eyes(s * 0.12, -s * 0.18, s * 0.06);
    }
    ctx.restore();
  }

  // ---------- oil-rig surface base (the hub) ----------
  function drawRig(ctx, w, h, t) {
    var sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#0a1018"); sky.addColorStop(0.6, "#0c1622"); sky.addColorStop(1, "#040810");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // distant lightning flicker
    if (Math.sin(t * 0.6) > 0.985) { ctx.fillStyle = "rgba(120,140,170,0.12)"; ctx.fillRect(0, 0, w, h * 0.5); }
    var seaY = h * 0.62;
    // rig silhouette (right side)
    ctx.fillStyle = "#070b11"; var rx = w * 0.62, rw = w * 0.3, pad = seaY - h * 0.16;
    ctx.fillRect(rx, pad, rw, h * 0.05); // platform deck
    ctx.strokeStyle = "#0b1119"; ctx.lineWidth = Math.max(3, w * 0.006);
    var legs = [rx + rw * 0.12, rx + rw * 0.5, rx + rw * 0.88];
    for (var i = 0; i < legs.length; i++) { ctx.beginPath(); ctx.moveTo(legs[i], pad + h * 0.05); ctx.lineTo(legs[i], seaY + h * 0.05); ctx.stroke(); }
    // cross-braces
    ctx.lineWidth = Math.max(1.5, w * 0.003); for (var b = 0; b < legs.length - 1; b++) { ctx.beginPath(); ctx.moveTo(legs[b], pad + h * 0.05); ctx.lineTo(legs[b + 1], seaY); ctx.moveTo(legs[b + 1], pad + h * 0.05); ctx.lineTo(legs[b], seaY); ctx.stroke(); }
    // derrick
    ctx.beginPath(); ctx.moveTo(rx + rw * 0.3, pad); ctx.lineTo(rx + rw * 0.42, pad - h * 0.18); ctx.lineTo(rx + rw * 0.54, pad); ctx.stroke();
    // warning lamps on the rig
    var lp = 0.5 + 0.5 * Math.sin(t * 4); glowDot(ctx, rx + rw * 0.42, pad - h * 0.185, w * 0.012, "#ff6452", lp);
    ctx.fillStyle = mix("#220505", "#ff6452", lp); ctx.beginPath(); ctx.arc(rx + rw * 0.42, pad - h * 0.185, Math.max(2, w * 0.004), 0, 7); ctx.fill();
    // sea
    var sea = ctx.createLinearGradient(0, seaY, 0, h); sea.addColorStop(0, "#0a1a22"); sea.addColorStop(1, "#02080e");
    ctx.fillStyle = sea; ctx.beginPath(); ctx.moveTo(0, seaY); for (var x = 0; x <= w; x += w / 20) ctx.lineTo(x, seaY + Math.sin(x * 0.02 + t * 1.5) * 4); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // chain (the tether) from rig down into the water + the sub
    var chx = rx + rw * 0.5; ctx.strokeStyle = "rgba(120,130,140,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(chx, pad + h * 0.05); ctx.lineTo(chx, seaY + 6); ctx.stroke(); ctx.setLineDash([]);
    glowDot(ctx, chx, seaY + 10, w * 0.02, PAL.amber, 0.5);
    // the little submarine hanging just below the surface
    ctx.save(); ctx.translate(chx, seaY + h * 0.06 + Math.sin(t * 1.2) * 3); var s = Math.min(w, h) * 0.04;
    poly(ctx, [[-s * 1.6, 0], [-s * 1.2, -s * 0.5], [s * 1.1, -s * 0.45], [s * 1.5, 0], [s * 1.1, s * 0.45], [-s * 1.2, s * 0.5]], PAL.steel, PAL.ink, 1.5);
    poly(ctx, [[-s * 0.3, -s * 0.5], [-s * 0.1, -s * 0.95], [s * 0.25, -s * 0.9], [s * 0.2, -s * 0.46]], PAL.steel, PAL.ink, 1);
    ctx.fillStyle = PAL.amberHi; for (var p = 0; p < 3; p++) { ctx.beginPath(); ctx.arc(-s * 0.5 + p * s * 0.5, -s * 0.05, s * 0.08, 0, 7); ctx.fill(); }
    ctx.restore();
    // fog
    if (cache.grain) { ctx.globalAlpha = 0.3; ctx.drawImage(cache.grain, 0, 0, w, h); ctx.globalAlpha = 1; }
  }

  // ---------- the CRANK: a physical valve wheel mounted in the cabin (diegetic; spins when you crank) ----------
  // o: { ang (radians), t, lit(0..1), active(bool — pulses to invite a crank when on hatch/source) }
  function drawValveWheel(ctx, cx, cy, r, o) {
    o = o || {}; var ang = o.ang || 0, t = o.t || 0, lit = o.lit == null ? 1 : o.lit, active = o.active;
    if (r < 3) return;
    ctx.save(); ctx.translate(cx, cy);
    // shadow pooling behind the wheel
    var sg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5); sg.addColorStop(0, "rgba(0,0,0,0.5)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
    // mounting plate + bolts (fixed, does not spin)
    ctx.fillStyle = PAL.steelLo; ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, 7); ctx.fill();
    ctx.strokeStyle = "#05080c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, 7); ctx.stroke();
    ctx.fillStyle = PAL.rivet; for (var bi = 0; bi < 6; bi++) { var ba = bi / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(ba) * r * 1.02, Math.sin(ba) * r * 1.02, Math.max(1.3, r * 0.07), 0, 7); ctx.fill(); }
    // invite glow when the wheel actually does something here
    if (active) { var pa = 0.45 + 0.55 * Math.sin(t * 5); ctx.save(); ctx.globalAlpha = pa * 0.6; glowDot(ctx, 0, 0, r * 1.5, PAL.bioHi, 1); ctx.restore(); }
    // the wheel (spins by ang)
    ctx.rotate(ang);
    var k = 0.5 + lit * 0.5;
    ctx.lineWidth = Math.max(3, r * 0.2); ctx.strokeStyle = mix(PAL.steelLo, PAL.steelHi, k); ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 7); ctx.stroke();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath(); ctx.arc(0, 0, r * 0.82, -0.7, 0.95); ctx.stroke(); // rim highlight
    for (var i = 0; i < 5; i++) { var a = i / 5 * Math.PI * 2;
      ctx.strokeStyle = PAL.steel; ctx.lineWidth = Math.max(3, r * 0.16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); ctx.stroke();
      ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = Math.max(1, r * 0.045); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1); ctx.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76); ctx.stroke(); }
    ctx.fillStyle = mix(PAL.steelLo, PAL.steel, k); ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.rivet; ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- diegetic RADIO comms readout (the only dive text; aged amber tube) ----------
  // r={x,y,w,h}; o={ speaker, line, reveal(char count), t, live, sig(0..1) }
  function drawRadio(ctx, r, o) {
    o = o || {}; var t = o.t || 0, full = o.line || o.text || "", sig = o.sig == null ? 1 : o.sig, speaker = o.speaker || "КОМАНДА";
    var col = speaker === "КОМАНДА" ? PAL.amberHi : speaker === "СЕРГЕЙ" ? PAL.phosHi : speaker === "K-219" ? PAL.bio : speaker === "ИСТОЧНИК" ? PAL.violetHi : PAL.textDim;
    ctx.save();
    ctx.fillStyle = PAL.steelLo; rrect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 5); ctx.fill();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1.5; rrect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 5); ctx.stroke();
    var fg = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h); fg.addColorStop(0, "#10140d"); fg.addColorStop(1, "#06090a");
    ctx.fillStyle = fg; rrect(ctx, r.x, r.y, r.w, r.h, 3); ctx.fill();
    ctx.save(); rrect(ctx, r.x, r.y, r.w, r.h, 3); ctx.clip();
    var nspeck = (6 + (1 - sig) * 70) | 0, nr = srnd(((t * 9) | 0) ^ 0x7a1c); ctx.fillStyle = "rgba(200,230,210,0.4)";
    for (var n = 0; n < nspeck; n++) ctx.fillRect(r.x + nr() * r.w, r.y + nr() * r.h, 1, 1);
    var pad = 11, fs = Math.max(9, r.h * 0.19);
    ctx.font = "bold " + fs + "px 'Courier New', monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    var on = (Math.sin(t * 4) > -0.2) && o.live; glowDot(ctx, r.x + pad + 2, r.y + fs * 0.95, 3.5, on ? col : PAL.steelHi, on ? 1 : 0.4);
    ctx.fillStyle = col; ctx.fillText("   " + speaker + (sig > 0.5 ? "" : "  [помехи]"), r.x + pad, r.y + fs + 2);
    var nshow = o.reveal != null ? (o.reveal | 0) : full.length, shown = full.slice(0, nshow), bfs = Math.max(10, r.h * 0.205);
    ctx.font = "bold " + bfs + "px 'Courier New', monospace";
    var maxw = r.w - pad * 2, words = shown.split(" "), line = "", yy = r.y + fs + bfs + 7, lh = bfs + 3;
    function flush(sLine) { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(sLine, r.x + pad + 1, yy + 1); ctx.fillStyle = PAL.text; ctx.fillText(sLine, r.x + pad, yy); yy += lh; }
    for (var i = 0; i < words.length; i++) { var test = line ? line + " " + words[i] : words[i]; if (ctx.measureText(test).width > maxw && line) { flush(line); line = words[i]; } else line = test; }
    if (line) flush(line);
    ctx.globalAlpha = 0.5; ctx.fillStyle = "rgba(0,0,0,0.22)"; for (var sy2 = r.y; sy2 < r.y + r.h; sy2 += 2) ctx.fillRect(r.x, sy2, r.w, 1); ctx.globalAlpha = 1;
    ctx.restore(); ctx.restore();
  }

  // ---------- retro title: boot flicker + Cyrillic stencil + recorder OSD stamp ----------
  function clampF(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function bootFlicker(t, dur) { if (t > dur) return 1; var base = (t / dur) * (t / dur);
    var flick = (Math.sin(t * 47) * Math.sin(t * 13) > 0.2) ? 1 : 0.15; return clampF(base * (0.5 + 0.5 * flick) + (t > dur * 0.8 ? 0.3 : 0), 0, 1); }
  function drawTitleStamp(ctx, w, h, t) {
    var cx = w / 2, boot = bootFlicker(t, 1.3);
    ctx.save(); ctx.globalAlpha = boot; ctx.textBaseline = "alphabetic";
    var ts = clampF(w * 0.12, 40, 116); ctx.font = "bold " + ts + "px 'Courier New', monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(180,40,40,0.45)"; ctx.fillText("ДРЕДНОУТ", cx - 2, h * 0.27);
    ctx.fillStyle = "rgba(70,120,255,0.40)"; ctx.fillText("ДРЕДНОУТ", cx + 2, h * 0.27);
    ctx.fillStyle = PAL.phosHi; ctx.fillText("ДРЕДНОУТ", cx, h * 0.27);
    ctx.font = "bold " + clampF(w * 0.02, 11, 20) + "px 'Courier New', monospace"; ctx.fillStyle = PAL.bio;
    ctx.fillText("D R E A D N O U G H T   ·   ГЛУБИНА", cx, h * 0.27 + clampF(w * 0.038, 18, 34)); ctx.restore();
    ctx.save(); ctx.globalAlpha = boot * 0.85; ctx.font = "bold " + clampF(w * 0.016, 10, 15) + "px 'Courier New', monospace"; ctx.textAlign = "left";
    var yr = 198 + (((t * 0.2) | 0) % 7); ctx.fillStyle = PAL.amberHi;
    ctx.fillText("REC ●  " + yr + "-11-04  03:1" + (((t * 1) | 0) % 10) + ":4" + (((t * 9) | 0) % 10), 18, 30);
    ctx.fillStyle = PAL.amber; ctx.fillText("ГЛУБИНА  −5200 М   ПРОЕКТ «ДРЕДНОУТ»", 18, 50);
    ctx.fillText("ПИЛОТ: СЕРГЕЙ", 18, 70);
    ctx.textAlign = "right"; ctx.fillStyle = PAL.amberLo || PAL.amber; ctx.fillText("СССР · СЕВ. ФЛОТ · СЕКРЕТНО", w - 18, h - 18); ctx.restore();
  }

  // ============ low-poly helpers + new 3D art (cutscene rig/sub, mutation face, hands, housings) ============
  function lerp(a, b, t) { return a + (b - a) * t; }
  // flat-shaded faceted quad: fill + a darker same-hue crease stroke (the low-poly "stepped" look)
  function facetQuad(ctx, p0, p1, p2, p3, lo, hi, sh, amb) {
    var k = (0.12 + sh * sh * 0.88) * amb; if (k > 1) k = 1;
    var r = (lo[0] + (hi[0] - lo[0]) * k) | 0, g = (lo[1] + (hi[1] - lo[1]) * k) | 0, b = (lo[2] + (hi[2] - lo[2]) * k) | 0;
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgb(" + (r * 0.55 | 0) + "," + (g * 0.55 | 0) + "," + (b * 0.55 | 0) + ")"; ctx.lineWidth = 1; ctx.stroke();
  }
  // perspective console-bezel skirt behind any axis-aligned rect (interactive rect is unchanged)
  function consoleHousing(ctx, r, o) {
    o = o || {}; var inset = o.inset == null ? 10 : o.inset, vy = o.vy == null ? r.y - r.h * 1.4 : o.vy, vx = r.x + r.w / 2, a = 0.06;
    function toV(x, y) { return [x + (vx - x) * a, y + (vy - y) * a]; }
    var x0 = r.x - inset, y0 = r.y - inset, x1 = r.x + r.w + inset, y1 = r.y + r.h + inset;
    var bTL = toV(x0, y0), bTR = toV(x1, y0), bBR = toV(x1, y1), bBL = toV(x0, y1);
    function side(p0, p1, p2, p3, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#05080c"; ctx.lineWidth = 1; ctx.stroke(); }
    side([x0, y0], [x1, y0], bTR, bTL, "#2a323c"); side([x1, y0], [x1, y1], bBR, bTR, "#1a2028");
    side([x0, y1], [x1, y1], bBR, bBL, "#10141a"); side([x0, y0], [x0, y1], bBL, bTL, "#1f262e");
    ctx.fillStyle = PAL.steelLo; rrect(ctx, x0, y0, r.w + inset * 2, r.h + inset * 2, 8); ctx.fill();
    ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1.5; rrect(ctx, x0 + 1, y0 + 1, r.w + inset * 2 - 2, r.h + inset * 2 - 2, 8); ctx.stroke();
    ctx.fillStyle = PAL.rivet; var nb = Math.max(4, (r.w / 44) | 0); for (var i = 0; i <= nb; i++) { ctx.beginPath(); ctx.arc(x0 + (r.w + inset * 2) * i / nb, y0 + 3, 1.8, 0, 7); ctx.fill(); }
  }
  // first-person low-poly gloved hands (foreground)
  function drawHands(ctx, o) {
    o = o || {}; var t = o.t || 0, san = o.sanity == null ? 1 : o.sanity, restY = o.restY, WW = o.w;
    var breathe = Math.sin(t * 1.1) * (4 + (1 - san) * 10), GLO = [18, 22, 26], GHI = [66, 76, 82];
    function hand(wx, wy, reach, mirror) {
      var ry = wy + (1 - reach) * (restY - wy) + breathe, s = WW * 0.10, dir = mirror ? -1 : 1;
      ctx.save(); ctx.translate(wx, ry); ctx.scale(dir, 1);
      poly(ctx, [[-s * 0.5, s * 2.6], [s * 0.5, s * 2.6], [s * 0.62, s * 0.5], [-s * 0.42, s * 0.5]], "rgb(" + (GLO[0] * 1.4 | 0) + "," + (GLO[1] * 1.4 | 0) + "," + (GLO[2] * 1.4 | 0) + ")", "#06090c", 1.2);
      poly(ctx, [[-s * 0.55, s * 0.55], [s * 0.6, s * 0.5], [s * 0.5, -s * 0.35], [-s * 0.45, -s * 0.3]], "rgb(" + ((GLO[0] + (GHI[0] - GLO[0]) * 0.72) | 0) + "," + ((GLO[1] + (GHI[1] - GLO[1]) * 0.72) | 0) + "," + ((GLO[2] + (GHI[2] - GLO[2]) * 0.72) | 0) + ")", "#07090d", 1.2);
      var curl = 0.5 - reach * 0.45;
      for (var f = 0; f < 4; f++) { var fx = (-0.34 + f * 0.30) * s * 1.05, base = -s * 0.3, len = s * (0.85 - f * 0.05);
        var midx = fx + Math.sin(curl) * len * 0.3, midy = base - Math.cos(curl) * len * 0.55, tipx = midx + Math.sin(curl * 0.6) * len * 0.25, tipy = midy - Math.cos(curl * 0.6) * len * 0.5, k = 0.55 + f * 0.06;
        ctx.strokeStyle = "rgb(" + ((GLO[0] + (GHI[0] - GLO[0]) * k) | 0) + "," + ((GLO[1] + (GHI[1] - GLO[1]) * k) | 0) + "," + ((GLO[2] + (GHI[2] - GLO[2]) * k) | 0) + ")";
        ctx.lineCap = "round"; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(fx, base); ctx.lineTo(midx, midy); ctx.lineTo(tipx, tipy); ctx.stroke(); }
      ctx.strokeStyle = "rgb(" + ((GLO[0] + (GHI[0] - GLO[0]) * 0.6) | 0) + "," + ((GLO[1] + (GHI[1] - GLO[1]) * 0.6) | 0) + "," + ((GLO[2] + (GHI[2] - GLO[2]) * 0.6) | 0) + ")";
      ctx.lineWidth = s * 0.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.15); ctx.lineTo(-s * 0.7, -s * 0.2 + reach * s * 0.2); ctx.stroke();
      ctx.restore();
    }
    hand(o.lx, o.ly, o.lReach || 0, true); hand(o.rx, o.ry, o.rReach || 0, false);
  }

  // ---------- THE MUTATION — a drowned human face on an eel body (low-poly software 3D) ----------
  var _mut = null;
  function mutationMesh() {
    if (_mut) return _mut;
    var nz = 11, ns = 12, rings = [];
    for (var i = 0; i < nz; i++) { var u = i / (nz - 1), z = -1.55 + u * 2.45;
      var head = Math.pow(Math.max(0, Math.sin(Math.min(1, u) * Math.PI)), 0.5), r = 0.07 + 0.62 * head + 0.10 * Math.max(0, u - 0.5);
      if (u > 0.7) r *= 1.0 + (u - 0.7) * 1.1;
      var ring = []; for (var j = 0; j < ns; j++) { var a = j / ns * Math.PI * 2, rib = (u < 0.55) ? (1 + 0.14 * Math.sin(a * 4 + i * 1.3)) : 1, flat = (u > 0.72) ? 0.72 : 1;
        ring.push([Math.cos(a) * r * rib, Math.sin(a) * r * 0.86 * rib, z * flat + z * (1 - flat)]); }
      rings.push(ring); }
    var faces = []; for (var i2 = 0; i2 < nz - 1; i2++) for (var j2 = 0; j2 < ns; j2++) { var jb = (j2 + 1) % ns; faces.push([rings[i2][j2], rings[i2][jb], rings[i2 + 1][jb], rings[i2 + 1][j2]]); }
    _mut = { faces: faces, faceZ: 0.92 }; return _mut;
  }
  function drawMutation(ctx, cx, cy, size, o) {
    o = o || {}; var yaw = o.yaw || 0, pitch = o.pitch || 0, smile = o.smile == null ? 0.85 : o.smile, t = o.t || 0, lit = o.lit == null ? 1 : o.lit, camZ = 3.0;
    var M = mutationMesh(), light = v3norm([0.12, -0.85, -0.5]); // dim-from-below underlight
    function tp(v) { var r = rot3(v, yaw, pitch); var z = r[2] + camZ; if (z < 0.25) z = 0.25; var f = size / z; return [cx + r[0] * f, cy - r[1] * f, z, r]; }
    var LO = [16, 20, 19], HI = [126, 134, 120], drawn = [], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (var i = 0; i < M.faces.length; i++) { var f = M.faces[i], p = [tp(f[0]), tp(f[1]), tp(f[2]), tp(f[3])];
      var n = v3norm(v3cross(v3sub(p[1][3], p[0][3]), v3sub(p[2][3], p[0][3]))), sh = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      for (var b = 0; b < 4; b++) { if (p[b][0] < minx) minx = p[b][0]; if (p[b][0] > maxx) maxx = p[b][0]; if (p[b][1] < miny) miny = p[b][1]; if (p[b][1] > maxy) maxy = p[b][1]; }
      drawn.push({ p: p, z: (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4, sh: sh }); }
    drawn.sort(function (a, b) { return b.z - a.z; });
    for (var d2 = 0; d2 < drawn.length; d2++) { var dn = drawn[d2], k = (0.10 + dn.sh * dn.sh * 0.9) * (0.40 + lit * 0.60);
      ctx.fillStyle = "rgb(" + Math.round(LO[0] + (HI[0] - LO[0]) * k) + "," + Math.round(LO[1] + (HI[1] - LO[1]) * k) + "," + Math.round(LO[2] + (HI[2] - LO[2]) * k) + ")";
      ctx.beginPath(); ctx.moveTo(dn.p[0][0], dn.p[0][1]); for (var q = 1; q < 4; q++) ctx.lineTo(dn.p[q][0], dn.p[q][1]); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
    var bcx = (minx + maxx) / 2, bcy = (miny + maxy) / 2, br = Math.max(maxx - minx, maxy - miny) * 0.66;
    var vg = ctx.createRadialGradient(bcx, bcy, br * 0.42, bcx, bcy, br); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(2,5,7," + (0.6 + (1 - lit) * 0.36).toFixed(2) + ")");
    ctx.save(); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(bcx, bcy, br, 0, 7); ctx.fill(); ctx.restore();
    var anchor = tp([0, 0, M.faceZ]), rim = tp([0, 0.6, M.faceZ]), faceR = Math.max(8, Math.abs(anchor[1] - rim[1]) * 1.15);
    drawMutationFace(ctx, anchor[0], anchor[1], faceR, { smile: smile, t: t, lit: lit });
  }
  // face-only renderer (jumpscare + reveal + body) — pallid underlit, too-wide smile, wrong drifting eyes
  function drawMutationFace(ctx, cx, cy, faceR, o) {
    o = o || {}; var smile = o.smile == null ? 0.85 : o.smile, t = o.t || 0, lit = o.lit == null ? 1 : o.lit, R = faceR, lo = lit, drift = Math.sin(t * 0.6) * R * 0.05;
    ctx.save(); ctx.translate(cx, cy);
    var fg = ctx.createLinearGradient(0, R * 0.9, 0, -R * 1.0);
    fg.addColorStop(0, "rgb(" + Math.round(120 * lo + 18) + "," + Math.round(126 * lo + 22) + "," + Math.round(110 * lo + 20) + ")");
    fg.addColorStop(0.5, "rgb(" + Math.round(54 * lo + 14) + "," + Math.round(60 * lo + 16) + "," + Math.round(54 * lo + 15) + ")");
    fg.addColorStop(1, "rgba(6,9,10,1)"); ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.95, R * 1.18, 0, 0, 7); ctx.fill();
    poly(ctx, [[-R * 0.95, -R * 0.2], [-R * 0.5, -R * 0.05], [-R * 0.6, R * 0.55]], "rgba(6,10,11,0.55)");
    poly(ctx, [[R * 0.95, -R * 0.2], [R * 0.5, -R * 0.05], [R * 0.6, R * 0.55]], "rgba(6,10,11,0.55)");
    poly(ctx, [[-R * 0.06, -R * 0.15], [R * 0.06, -R * 0.15], [R * 0.10, R * 0.25], [-R * 0.10, R * 0.25]], "rgba(170,178,160," + (0.18 + 0.18 * lit).toFixed(2) + ")");
    function eye(ex, ey, er, dx, look) {
      ctx.fillStyle = "rgba(5,9,9,0.9)"; ctx.beginPath(); ctx.ellipse(ex, ey, er * 1.5, er * 1.25, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(176,182,166," + (0.5 + 0.4 * lit).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(ex, ey, er, 0, 7); ctx.fill();
      ctx.fillStyle = "#04060a"; ctx.beginPath(); ctx.arc(ex + dx, ey + look, er * 0.42, 0, 7); ctx.fill(); glowDot(ctx, ex, ey, er * 1.3, "#324a40", 0.10 * lit);
    }
    eye(-R * 0.42, -R * 0.30, R * 0.16, drift, Math.sin(t * 0.4) * R * 0.03);
    eye(R * 0.42, -R * 0.30, R * 0.16, -drift * 0.6, Math.sin(t * 0.9 + 2) * R * 0.04);
    eye(R * 0.66, -R * 0.02, R * 0.10, Math.sin(t * 1.5) * R * 0.03, 0); // the wrong extra eye
    var halfW = R * (0.5 + smile * 0.42), curl = R * (0.30 + smile * 0.34), my = R * 0.42;
    ctx.strokeStyle = "rgba(8,5,6,0.92)"; ctx.lineWidth = Math.max(1.5, R * 0.05); ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-halfW, my - curl); ctx.quadraticCurveTo(0, my + R * 0.18, halfW, my - curl); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.moveTo(-halfW, my - curl); ctx.quadraticCurveTo(0, my + R * 0.18, halfW, my - curl); ctx.lineTo(halfW, my + R * 0.5); ctx.lineTo(-halfW, my + R * 0.5); ctx.closePath(); ctx.clip();
    var nt = 16; for (var i = 0; i < nt; i++) { var u = i / (nt - 1), tx = (u - 0.5) * 2 * halfW, sm = Math.sin(u * Math.PI), ty = my + R * 0.18 * sm - curl * (1 - sm), tw = (halfW * 2 / nt) * 0.42;
      poly(ctx, [[tx - tw, ty], [tx + tw, ty], [tx + tw * 0.7, ty + R * 0.22], [tx - tw * 0.7, ty + R * 0.22]], (i % 2) ? "#d9d2bf" : "#c7bfa9"); }
    ctx.restore();
    var bg = ctx.createLinearGradient(0, -R * 1.18, 0, -R * 0.3); bg.addColorStop(0, "rgba(2,4,5,0.95)"); bg.addColorStop(1, "rgba(2,4,5,0)");
    ctx.fillStyle = bg; ctx.fillRect(-R, -R * 1.2, R * 2, R * 0.95);
    ctx.restore();
  }

  // ---------- the unseen thing: ONLY ever a vast dark mass moving (no model, no face) ----------
  function drawShadowMass(ctx, cx, cy, size, o) {
    o = o || {}; var t = o.t || 0, lit = o.lit == null ? 0.5 : o.lit, elong = o.elong || 1, drift = Math.sin(t * 0.5) * size * 0.06;
    ctx.save();
    // a faint cold rim so the dark reads as a PRESENCE, not just emptiness
    var rim = ctx.createRadialGradient(cx + drift, cy, size * 0.3, cx + drift, cy, size * 1.05);
    rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(0.82, "rgba(28,50,50," + (0.05 + 0.07 * lit).toFixed(3) + ")"); rim.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(cx + drift, cy, size * elong, size * 0.95, 0, 0, 7); ctx.fill();
    // layered black blobs, slowly churning — an immense shape with no edges you can hold
    for (var i = 0; i < 3; i++) { var ox = Math.sin(t * 0.4 + i * 2) * size * 0.12, oy = Math.cos(t * 0.3 + i) * size * 0.08, r = size * (0.92 - i * 0.18);
      var bg = ctx.createRadialGradient(cx + ox + drift, cy + oy, 0, cx + ox + drift, cy + oy, r);
      bg.addColorStop(0, "rgba(1,3,4,0.97)"); bg.addColorStop(0.6, "rgba(2,5,7,0.82)"); bg.addColorStop(1, "rgba(2,5,7,0)");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(cx + ox + drift, cy + oy, r * elong, r * 0.92, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // first-person SEATED PILOT — dark low-poly suited body/lap + arms; the hands attach to it
  function drawBody(ctx, o) {
    o = o || {}; var t = o.t || 0, w = o.w, h = o.h, san = o.sanity == null ? 1 : o.sanity, par = o.par || 0;
    var bob = Math.sin(t * 1.1) * (3 + (1 - san) * 9), cx = w * 0.5 + par;
    ctx.save(); ctx.translate(0, bob);
    // lap / thighs — two low-poly wedges filling the bottom corners
    poly(ctx, [[cx - w * 0.42, h], [cx - w * 0.02, h], [cx - w * 0.12, h * 0.80], [cx - w * 0.34, h * 0.83]], "#161b22", "#06090c", 1.5);
    poly(ctx, [[cx + w * 0.02, h], [cx + w * 0.42, h], [cx + w * 0.34, h * 0.83], [cx + w * 0.12, h * 0.80]], "#161b22", "#06090c", 1.5);
    // central torso/harness rising between the thighs
    poly(ctx, [[cx - w * 0.13, h], [cx + w * 0.13, h], [cx + w * 0.09, h * 0.74], [cx - w * 0.09, h * 0.74]], "#1b212a", "#06090c", 1.5);
    poly(ctx, [[cx - w * 0.035, h * 0.76], [cx + w * 0.035, h * 0.76], [cx + w * 0.05, h], [cx - w * 0.05, h]], "#2a323c", null); // suit zip highlight
    // suit buckle
    ctx.fillStyle = "#3a2f12"; ctx.fillRect(cx - w * 0.03, h * 0.88, w * 0.06, h * 0.03);
    ctx.restore();
  }

  // ---------- cinematic 3D: low-poly oil rig + DN-7 sub (for the intro cutscene) ----------
  function boxFaces(x0, y0, z0, x1, y1, z1) { var c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return [[c[0], c[1], c[2], c[3]], [c[5], c[4], c[7], c[6]], [c[4], c[0], c[3], c[7]], [c[1], c[5], c[6], c[2]], [c[3], c[2], c[6], c[7]], [c[4], c[5], c[1], c[0]]]; }
  function shearLeg(x, z, ox, oz) { var s = 0.34, ty = 6, by = -2;
    var T = [[x - s, ty, z - s], [x + s, ty, z - s], [x + s, ty, z + s], [x - s, ty, z + s]], B = [[x - s + ox, by, z - s + oz], [x + s + ox, by, z - s + oz], [x + s + ox, by, z + s + oz], [x - s + ox, by, z + s + oz]];
    return [[T[0], T[1], B[1], B[0]], [T[1], T[2], B[2], B[1]], [T[2], T[3], B[3], B[2]], [T[3], T[0], B[0], B[3]]]; }
  function braceQuads(xL, xR, z, y0, y1) { var w = 0.12; return [[[xL, y0, z - w], [xR, y1, z - w], [xR, y1, z + w], [xL, y0, z + w]], [[xR, y0, z - w], [xL, y1, z - w], [xL, y1, z + w], [xR, y0, z + w]]]; }
  function tetraStruts(ax, ay, az, base, top) { var f = []; for (var i = 0; i < 4; i++) { var a0 = i / 4 * Math.PI * 2, a1 = (i + 1) / 4 * Math.PI * 2; f.push([[ax + Math.cos(a0) * base, ay, az + Math.sin(a0) * base], [ax + Math.cos(a1) * base, ay, az + Math.sin(a1) * base], [ax, ay + top, az]]); } return f; }
  function drawRigMesh(ctx, proj, t, uw) { uw = uw || 0; var light = v3norm([0.4, 0.7, -0.55]), LO = [14, 19, 25], HI = [82, 96, 108], faces = [], legX = [-3.4, 3.4], legZ = [-2.2, 2.2];
    for (var lx = 0; lx < 2; lx++) for (var lz = 0; lz < 2; lz++) { var x = legX[lx], z = legZ[lz], bot = (x < 0 ? -0.9 : 0.9), botz = (z < 0 ? -0.6 : 0.6), bx = shearLeg(x, z, bot, botz); for (var f0 = 0; f0 < bx.length; f0++) faces.push(bx[f0]); }
    faces.push.apply(faces, braceQuads(-3.4, 3.4, -2.2, 1, 5)); faces.push.apply(faces, braceQuads(-3.4, 3.4, 2.2, 1, 5));
    faces.push.apply(faces, boxFaces(-4.2, 6, -3.0, 4.2, 7.2, 3.0)); faces.push.apply(faces, boxFaces(-2.4, 7.2, -1.6, 1.0, 9.4, 1.4)); faces.push.apply(faces, tetraStruts(2.4, 7.2, 0, 1.4, 6.4));
    var drawn = []; for (var i = 0; i < faces.length; i++) { var f = faces[i], P = [], ok = true, zc = 0;
      for (var k = 0; k < f.length; k++) { var pp = proj(f[k]); if (!pp.v) { ok = false; break; } P.push(pp); zc += pp.z; } if (!ok) continue; zc /= f.length;
      var n = v3norm(v3cross(v3sub(f[1], f[0]), v3sub(f[2], f[0]))), sh = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]); drawn.push({ P: P, z: zc, sh: sh }); }
    drawn.sort(function (a, b) { return b.z - a.z; });
    for (var d = 0; d < drawn.length; d++) { var dn = drawn[d], kf = (0.18 + dn.sh * dn.sh * 0.82) * (1 - uw * 0.55);
      ctx.fillStyle = "rgb(" + ((LO[0] + (HI[0] - LO[0]) * kf) | 0) + "," + ((LO[1] + (HI[1] - LO[1]) * kf) | 0) + "," + ((LO[2] + (HI[2] - LO[2]) * kf) | 0) + ")";
      ctx.beginPath(); ctx.moveTo(dn.P[0].x, dn.P[0].y); for (var q = 1; q < dn.P.length; q++) ctx.lineTo(dn.P[q].x, dn.P[q].y); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(2,5,9,0.8)"; ctx.stroke(); }
    var lp = proj([2.4, 13.6, 0]); if (lp.v && uw < 0.9) { var bl = 0.5 + 0.5 * Math.sin(t * 4); glowDot(ctx, lp.x, lp.y, Math.max(4, lp.s * 0.05), "#ff6452", bl * (1 - uw)); ctx.fillStyle = mix("#220505", "#ff6452", bl); ctx.beginPath(); ctx.arc(lp.x, lp.y, Math.max(2, lp.s * 0.012), 0, 7); ctx.fill(); }
  }
  var _dn7 = null;
  function dn7Mesh() { if (_dn7) return _dn7; var nz = 7, ns = 10, rings = [];
    for (var i = 0; i < nz; i++) { var u = i / (nz - 1), zz = -1 + u * 2, r = Math.sqrt(Math.max(0, 1 - zz * zz)) * 0.9 + 0.08, ring = []; for (var j = 0; j < ns; j++) { var a = j / ns * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r, zz]); } rings.push(ring); }
    var faces = []; for (var i2 = 0; i2 < nz - 1; i2++) for (var j2 = 0; j2 < ns; j2++) { var jb = (j2 + 1) % ns; faces.push([rings[i2][j2], rings[i2][jb], rings[i2 + 1][jb], rings[i2 + 1][j2]]); } _dn7 = { faces: faces }; return _dn7; }
  function drawCableSub(ctx, proj, t, ct) { var CUT = 10.2, cut = ct > CUT, sy = ct < 8.6 ? 5 - (ct / 8.6) * 5 : 0; if (cut) { var fp0 = ct - CUT; sy = 0 - (fp0 * fp0 * 3.0); }
    var tip = cut ? Math.min(1.3, (ct - CUT) * 0.9) : 0, center = [0, sy, 0], scale = 1.5, top = [center[0], center[1] + 1.4, center[2]], apex = [2.4, 13.6, 0], a = proj(apex), b = proj(top);
    if (a.v && b.v) { ctx.strokeStyle = "rgba(140,150,160,0.75)"; ctx.lineWidth = Math.max(1.5, b.s * 0.006);
      if (!cut) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      else { var fp = clamp((ct - CUT) * 4, 0, 1), midx = lerp(a.x, b.x, 0.45), midy = lerp(a.y, b.y, 0.45) + fp * 30;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(midx + 10, midy, a.x + 6, a.y + 40 * fp); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(b.x - 8, b.y - 20 * fp, b.x - 4, b.y - 50 * fp); ctx.stroke(); } }
    var M = dn7Mesh(), light = v3norm([0.4, 0.6, -0.6]), LO = [26, 32, 40], HI = [96, 110, 122];
    function wp(v) { var cyq = Math.cos(tip), syq = Math.sin(tip), y = v[1] * cyq - v[2] * syq, z = v[1] * syq + v[2] * cyq; return proj([center[0] + v[0] * scale, center[1] + y * scale, center[2] + z * scale]); }
    var drawn = []; for (var i = 0; i < M.faces.length; i++) { var f = M.faces[i], P = [wp(f[0]), wp(f[1]), wp(f[2]), wp(f[3])], ok = true, zc = 0; for (var k = 0; k < 4; k++) { if (!P[k].v) { ok = false; break; } zc += P[k].z; } if (!ok) continue; zc /= 4;
      var n = v3norm(v3cross(v3sub(f[1], f[0]), v3sub(f[2], f[0]))), sh = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]); drawn.push({ P: P, z: zc, sh: sh }); }
    drawn.sort(function (x, y) { return y.z - x.z; });
    for (var d = 0; d < drawn.length; d++) { var dn = drawn[d], kf = 0.2 + dn.sh * dn.sh * 0.8;
      ctx.fillStyle = "rgb(" + ((LO[0] + (HI[0] - LO[0]) * kf) | 0) + "," + ((LO[1] + (HI[1] - LO[1]) * kf) | 0) + "," + ((LO[2] + (HI[2] - LO[2]) * kf) | 0) + ")";
      ctx.beginPath(); ctx.moveTo(dn.P[0].x, dn.P[0].y); for (var q = 1; q < 4; q++) ctx.lineTo(dn.P[q].x, dn.P[q].y); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(2,5,9,0.85)"; ctx.stroke(); }
    var ph = wp([0.5, 0.2, 0.95]); if (ph.v) { var pr2 = Math.max(3, ph.s * 0.022);
      ctx.fillStyle = "#0c0f13"; ctx.beginPath(); ctx.arc(ph.x, ph.y, pr2, 0, 7); ctx.fill(); // porthole frame
      ctx.strokeStyle = PAL.steelHi; ctx.lineWidth = 1; ctx.stroke();
      glowDot(ctx, ph.x, ph.y, pr2 * 1.5, PAL.amberHi, 0.85); ctx.fillStyle = PAL.amberHi; ctx.beginPath(); ctx.arc(ph.x, ph.y, pr2 * 0.55, 0, 7); ctx.fill(); }
    // tail fin (a small dark blade) so the bathysphere reads as a vessel, not a ball
    var fa = wp([0, -0.3, -1.05]), fb = wp([0, 0.5, -1.5]), fc = wp([0, -0.7, -1.4]);
    if (fa.v && fb.v && fc.v) { ctx.fillStyle = "#10141a"; ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(fb.x, fb.y); ctx.lineTo(fc.x, fc.y); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(2,5,9,0.85)"; ctx.lineWidth = 1; ctx.stroke(); }
  }

  root.DN = root.DN || {};
  root.DN.Art = {
    PAL: PAL, rebake: rebake, drawWater: drawWater, drawSonar: drawSonar, drawPortrait: drawPortrait,
    drawCockpit: drawCockpit, gauge: gauge, card: card, glyph: glyph, button: button, overlay: overlay,
    text: text, wrapText: wrapText, rrect: rrect, drawTitle: drawTitle, catColor: catColor, mix: mix,
    drawGrid: drawGrid, drawCell: drawCell, lootGlyph: lootGlyph, numColor: numColor, glowDot: glowDot, textCentered: textCentered,
    drawForward: drawForward, drawOxygenTank: drawOxygenTank, drawDepthGauge: drawDepthGauge, drawWarnLamp: drawWarnLamp, drawLeak: drawLeak,
    drawPlushie: drawPlushie, drawRig: drawRig, drawAngler3D: drawAngler3D, drawBloop3D: drawBloop3D,
    drawValveWheel: drawValveWheel, drawRadio: drawRadio, drawTitleStamp: drawTitleStamp, bootFlicker: bootFlicker,
    v3norm: v3norm, facetQuad: facetQuad, consoleHousing: consoleHousing, drawHands: drawHands, drawBody: drawBody,
    drawMutation: drawMutation, drawMutationFace: drawMutationFace, drawShadowMass: drawShadowMass,
    drawRigMesh: drawRigMesh, drawCableSub: drawCableSub,
  };
})(typeof window !== "undefined" ? window : this);
