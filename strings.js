/* DREADNOUGHT v2 — all player-visible UI chrome strings (externalized for localization).
 * Card/contact flavour now lives in data.js. */
(function (root) {
  "use strict";
  var STR = {
    lang: "en",

    title: "DREADNOUGHT",
    subtitle: "soundings from the trench",
    tagline: "A deep-sea deduction salvage horror",

    menu_dive: "BEGIN",
    menu_help: "BRIEFING",
    menu_options: "SYSTEMS",
    menu_back: "BACK",

    // HUD
    hud_hull: "HULL",
    hud_oxygen: "O₂",
    hud_sanity: "MIND",
    hud_money: "₽",
    hud_depth: "DEPTH",
    hud_zone: "ZONE",
    hud_meters: "m",
    hud_hold: "HOLD",
    hud_data: "DATA",
    hud_peeks: "PULSE",

    // dive controls
    btn_ascend: "ASCEND",
    btn_flag: "FLAG",
    btn_probe: "PROBE",
    btn_peek: "PULSE-SCAN",
    flag_on: "FLAG MODE",
    flag_off: "PROBE MODE",

    // surface / port
    port_title: "PORT — THE DREADNOUGHT",
    port_dive: "DIVE",
    port_shop: "OUTFIT",
    port_sell: "SELL CARGO",
    port_sell_none: "Hold empty — nothing to sell.",
    port_cargo: "CARGO",
    port_depth_pick: "DIVE TO:",
    port_locked: "LOCKED",
    port_owned: "OWNED",
    port_max: "MAX",
    port_buy: "BUY",
    port_cant_afford: "Not enough ₽.",
    port_bought: "Outfitted: {name}.",
    port_sold: "Sold cargo for ₽{amt}.",

    // dive log
    log_dive_start: "Ballast vented. Diving to {zone} — {d}m.",
    log_first_probe: "Active ping. The scope resolves.",
    log_probe_safe: "Clear water.",
    log_flood: "A pocket of dead seabed opens.",
    log_data: "Data logged. +₽{amt}.",
    log_wreck: "Wreck cracked open — salvage pocket exposed.",
    log_artifact: "Recovered {name}. The hold hums.",
    log_shard: "A SOURCE SHARD. It sings to the others.",
    log_vent: "Thermal vent — air and patching. +{o2} O₂, +{hull} HULL.",
    log_monster: "{name} — {dmg}!",
    log_monster_mind: "{name} gets into the crew's heads — {dmg}!",
    log_no_o2: "Air critical. Emergency ascent.",
    log_low_sanity: "MIND FAILING — scope readings unreliable.",
    log_flag: "Marked.",
    log_unflag: "Mark cleared.",
    log_peek_none: "No pulse-scan charges left.",
    log_peek: "Pulse-scan: {what}.",
    log_no_peek_target: "Pulse-scan a fogged cell.",
    log_chord_locked: "Auto-chord relay not installed.",
    log_ascend: "Blowing ballast. Surfacing with the hold.",
    log_bank: "Surfaced. Banked ₽{data} in data" ,
    log_reshuffle: "",

    // cell / monster identity
    unknown: "UNKNOWN",
    safe_cell: "open seabed",
    cat_data: "DATA NODE",
    cat_wreck: "WRECK",
    cat_artifact: "ARTIFACT",
    cat_shard: "SOURCE SHARD",
    cat_vent: "THERMAL VENT",
    cat_monster: "BIOLOGIC",

    threat_hull: "hull-threat",
    threat_mind: "mind-threat",

    // end states
    win_title: "THE SOURCE OPENS",
    win_body: "The shards align and the trench floor unfolds like a throat. The signal was never a distress call — it was a lure, and a warning, in a voice older than the ice. You surface with the truth and a hold full of things that should have stayed sunk. The Dreadnought is rich. The Dreadnought is changed.",
    lose_hull: "HULL BREACH",
    lose_hull_body: "Cold black water finds every seam at once. The Dreadnought folds inward with a sound like a struck bell. The hold spills into the dark.",
    lose_sanity: "ALL HANDS LOST",
    lose_sanity_body: "There was no monster on that cell. There never was. The crew has simply stopped being a crew, down here where the pressure thinks for you.",
    again: "RETURN TO PORT",
    dive_lost: "Dive lost. The hold is gone to the trench.",
    dive_lost_tongs: "Dive lost — but the tongs held {name}.",

    // briefing
    help_title: "BRIEFING",
    help_lines: [
      "The sonar scope is a grid of fogged cells. PROBE a cell to read it. The first probe of a dive is always safe.",
      "A revealed number = how many MONSTERS hide in the 8 cells around it. Deduce where they are. A 0 opens its neighbours for free.",
      "FLAG cells you believe are monsters (free). Every PROBE spends OXYGEN — you can't reveal everything, so think.",
      "Safe cells hold loot: DATA banks as cash, WRECKS open pockets, ARTIFACTS are cargo to sell, VENTS refill air, SHARDS open the Source.",
      "Hit a monster and it strikes your HULL or your crew's MIND. At 0 hull or 0 mind the dive — and its hold — is lost.",
      "ASCEND any time to bank what you've gathered. Sell at port, buy upgrades, charter deeper zones. Deeper = worse monsters, richer loot.",
      "Reach the Source at the trench floor — if the crew's mind holds that deep.",
    ],
    help_controls: "Tap a cell to PROBE. Toggle FLAG MODE to mark monsters (or long-press / right-click). Keys: arrows move, Space/Enter probe, F flag, P pulse-scan, A ascend.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_on: "ON",
    opt_off: "OFF",

    confirm_ascend: "Ascend now and bank the hold?",
    yes: "ASCEND",
    no: "STAY DOWN",
  };

  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
