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
  var cache = { w:0, h:0, grain:null, scan:null };
  function makeCanvas(w,h){ var c=document.createElement("canvas"); c.width=w; c.height=h; return c; }

  function rebake(w, h) {
    if (cache.w === w && cache.h === h) return;
    cache.w = w; cache.h = h;
    // grain: sparse dither speckle
    var g = makeCanvas(w, h), gx = g.getContext("2d");
    var img = gx.createImageData(w, h), d = img.data;
    for (var i=0;i<w*h;i++){ var v = Math.random(); var a = v>0.93?38: v>0.86?18:0; var o=i*4;
      d[o]=120; d[o+1]=150; d[o+2]=150; d[o+3]=a; }
    gx.putImageData(img,0,0); cache.grain = g;
    // scanlines
    var s = makeCanvas(w, h), sx = s.getContext("2d");
    sx.fillStyle = "rgba(0,0,0,0.20)";
    for (var y=0;y<h;y+=2) sx.fillRect(0,y,w,1);
    cache.scan = s;
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

  function button(ctx, r, label, opts) {
    opts = opts||{};
    var grd = ctx.createLinearGradient(r.x,r.y,r.x,r.y+r.h);
    grd.addColorStop(0, opts.primary?"#3a2f12":PAL.steelHi); grd.addColorStop(1, opts.primary?"#1c1606":PAL.steelLo);
    ctx.fillStyle = opts.disabled?"#15181d":grd; rrect(ctx,r.x,r.y,r.w,r.h,5); ctx.fill();
    ctx.strokeStyle = opts.hover?PAL.amberHi:(opts.primary?PAL.amber:PAL.steel); ctx.lineWidth=opts.hover?2:1.2; rrect(ctx,r.x,r.y,r.w,r.h,5); ctx.stroke();
    text(ctx, label, r.x+r.w/2, r.y+r.h/2+Math.round(r.h*0.18), Math.min(18, Math.round(r.h*0.42)), opts.disabled?PAL.textDim:(opts.primary?PAL.amberHi:PAL.text), "center");
  }

  function overlay(ctx, w, h, opts) {
    opts = opts||{};
    // vignette
    var vg = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.3, w/2,h/2, Math.max(w,h)*0.72);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.72)");
    ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);
    // scanlines
    if (opts.scanlines!==false && cache.scan) ctx.drawImage(cache.scan, 0, 0, w, h);
    // sanity tint (creeping red/violet at low mind)
    if (opts.sanity!=null && opts.sanity<0.5){ var a=(0.5-opts.sanity)*0.5;
      ctx.fillStyle="rgba(120,30,60,"+a*0.5+")"; ctx.fillRect(0,0,w,h); }
    // damage / event flash
    if (opts.flash>0){ ctx.fillStyle="rgba("+(opts.flashCol||"180,40,40")+","+Math.min(0.6,opts.flash)+")"; ctx.fillRect(0,0,w,h); }
    // grain
    if (cache.grain){ ctx.globalAlpha=0.35; ctx.drawImage(cache.grain,0,0,w,h); ctx.globalAlpha=1; }
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

  root.DN = root.DN || {};
  root.DN.Art = {
    PAL: PAL, rebake: rebake, drawWater: drawWater, drawSonar: drawSonar, drawPortrait: drawPortrait,
    drawCockpit: drawCockpit, gauge: gauge, card: card, glyph: glyph, button: button, overlay: overlay,
    text: text, wrapText: wrapText, rrect: rrect, drawTitle: drawTitle, catColor: catColor, mix: mix,
  };
})(typeof window !== "undefined" ? window : this);
