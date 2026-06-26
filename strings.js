/* DREADNOUGHT v3 — player-visible UI strings (externalized for localization). */
(function (root) {
  "use strict";
  var STR = {
    lang: "en",

    title: "DREADNOUGHT",
    subtitle: "iron depths",
    tagline: "Pilot a sub into the black. Read the radar. Pray it stays empty.",

    menu_dive: "DESCEND",
    menu_help: "BRIEFING",
    menu_options: "SYSTEMS",
    menu_back: "BACK",

    // HUD
    hud_hull: "HULL",
    hud_oxygen: "AIR",
    hud_threat: "NOISE",
    hud_depth: "DEPTH",
    hud_meters: "m",
    hud_haul: "HAUL",

    // controls
    btn_thrust: "THRUST",
    btn_left: "◄",
    btn_right: "►",
    btn_ping: "PING",
    btn_light: "LIGHT",
    btn_silent: "RUN SILENT",

    // dive log
    log_dive: "Ballast blown. The Dreadnought sinks into the dark.",
    log_ping: "Active ping. The scope answers.",
    log_classify: "Returns classified: {n} contact(s) on the scope.",
    log_light_on: "Floodlight on. The dark recoils — and notices.",
    log_light_off: "Lights out. Running dark.",
    log_collect_data: "Hauled in data. +₽{v}.",
    log_collect_art: "Recovered {name}. +₽{v}. The hold hums.",
    log_collect_vent: "Thermal pocket — the tanks drink. +{o2} AIR.",
    log_strike: "{name} hits the hull! −{dmg}.",
    log_wake: "Something woke. A contact is closing.",
    log_panic: "THEY KNOW WE'RE HERE. Run silent or run.",
    log_source_near: "The signal is directly ahead. Nine seconds between pulses. Closer.",
    log_no_air: "Air gone. The gauges blur.",

    // contact identity
    unknown: "UNKNOWN RETURN",
    cat_data: "DATA",
    cat_artifact: "ARTIFACT",
    cat_vent: "THERMAL VENT",
    cat_source: "THE SOURCE",
    cat_monster: "BIOLOGIC",
    classify_ping: "Ping to classify.",

    // end states
    win_title: "THE SOURCE",
    win_body: "The pulses fuse into one long note and the trench floor unfolds like a throat. The signal was a lure and a warning, in a voice older than the ice. The radar fills edge to edge with a single contact. There is nowhere to reverse to. You found it. It found you first.",
    lose_hull: "HULL BREACH",
    lose_hull_body: "Cold black water finds every seam at once. The Dreadnought folds inward with a sound like a struck bell, and the radar goes dark.",
    lose_oxygen: "ASPHYXIA",
    lose_oxygen_body: "The last good air thins to nothing. The ping keeps sweeping an empty scope for no one. The descent continues without you.",
    again: "DESCEND AGAIN",
    end_depth: "Reached {d}m   ·   Hauled ₽{haul}",

    // briefing
    help_title: "BRIEFING",
    help_lines: [
      "You are sealed in the Dreadnought, descending a black trench to trace a signal. You cannot see out. The RADAR is your only window.",
      "PING to sweep the scope. Each return is a contact — bearing and range. Pinging is loud: it raises NOISE.",
      "PING again on a contact to classify it: green/amber returns are loot and air; a RED return is alive. Never thrust toward red.",
      "THRUST forward and TURN to steer through the water. Reach a loot contact to haul it in. Reach a monster and it strikes the hull.",
      "The FLOODLIGHT shows what's dead ahead — and screams your position into the dark. NOISE wakes the things below; RUN SILENT to fade.",
      "AIR is your clock. Thermal vents refill it. Descend far enough and you will find the Source. You may wish you hadn't.",
    ],
    help_controls: "THRUST: W / ↑ / hold THRUST.  TURN: A D / ← →.  PING: Space.  LIGHT: L.  SILENT: S. Gamepad supported.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_on: "ON",
    opt_off: "OFF",
  };

  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
