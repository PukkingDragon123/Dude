/* DREADNOUGHT — all player-visible UI chrome strings.
 * Externalized so switching language is a data change, not a code change.
 * Card and contact flavour text lives in data.js (also external data). */
(function (root) {
  "use strict";
  var STR = {
    lang: "en",

    title: "DREADNOUGHT",
    subtitle: "descent into the trench",
    tagline: "A horror roguelike deckbuilder",

    menu_dive: "BEGIN DIVE",
    menu_continue: "RESUME DIVE",
    menu_help: "BRIEFING",
    menu_options: "SYSTEMS",
    menu_seed: "SEED",
    menu_back: "BACK",

    // HUD
    hud_hull: "HULL",
    hud_oxygen: "O2",
    hud_sanity: "MIND",
    hud_power: "PWR",
    hud_depth: "DEPTH",
    hud_band: "ZONE",
    hud_meters: "m",
    hud_deck: "DECK",
    hud_discard: "USED",
    hud_descend: "DESCEND",
    hud_endturn: "HOLD POSITION",
    hud_contacts: "CONTACTS",

    // actions / log
    log_dive_start: "Ballast vented. The Dreadnought slips below the surface.",
    log_band_enter: "Depth {d}m. Sonar contacts on the scope.",
    log_ping: "Active ping. Returns classified by signature.",
    log_scan: "Deep scan: {name} — {threat}.",
    log_scan_phantom: "Scan returns nothing. The contact was never there.",
    log_investigate: "Approaching {name}…",
    log_evade: "Evasive trim. {name} loses our scent.",
    log_brace: "Hull plating reinforced.",
    log_vent: "Scrubbers purged. Oxygen restored.",
    log_steady: "The crew steadies. Breathing slows.",
    log_descend: "Diving deeper. The dark closes in.",
    log_creature_attack: "{name} strikes the hull!",
    log_anomaly_drain: "Something wrong leaks into the cabin. The crew frays.",
    log_low_sanity: "Sonar readings unreliable — the crew is seeing things.",
    log_no_power: "Not enough power this cycle.",
    log_reward_card: "Salvaged: {name} added to the deck.",
    log_reward_res: "{res}",
    log_reshuffle: "Reshuffling the deck.",
    log_reveal_all: "Resonance floods the scope — every contact laid bare.",

    threat_safe: "no threat",
    threat_t1: "minor threat",
    threat_t2: "serious threat",
    threat_t3: "EXTREME THREAT",
    unknown: "UNKNOWN",

    cat_wreck: "STRUCTURE",
    cat_artifact: "ARTIFACT",
    cat_creature: "BIOLOGIC",
    cat_anomaly: "ANOMALY",

    // end states
    win_title: "THE SOURCE",
    win_body: "The signal was never a distress call. It was a lure — and a warning, in a voice older than the ice. You surface with the truth and a hold full of things that should have stayed sunk.",
    lose_hull: "HULL BREACH",
    lose_hull_body: "Cold black water finds every seam at once. The Dreadnought folds inward with a sound like a struck bell, and is gone.",
    lose_oxygen: "ASPHYXIA",
    lose_oxygen_body: "The last good air thins to nothing. The gauges blur. The descent continues without anyone to read them.",
    lose_sanity: "ALL HANDS LOST",
    lose_sanity_body: "There is no monster on the scope. There never was. The crew has simply stopped being a crew, down here where the pressure thinks for you.",
    again: "DIVE AGAIN",

    // briefing
    help_title: "BRIEFING",
    help_lines: [
      "You command the Dreadnought, a small submarine sent to trace a signal from the trench floor.",
      "Read the dark before you touch it. PING classifies every contact; SCAN identifies one fully.",
      "INVESTIGATE a contact to salvage cards and lore — but a creature you haven't EVADED will strike when you DESCEND.",
      "BRACE mends hull, VENT restores oxygen, STEADY calms the crew. Power (PWR) is your budget each cycle.",
      "Holding position refills power but burns oxygen. Descending burns more. Reach the source at the floor — if you can.",
      "If the mind breaks, the scope lies to you.",
    ],
    help_controls: "Click / tap a card then a contact. Keys 1–9 play a card, D descend, Space hold, H briefing.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_textscale: "TEXT SIZE",
    opt_on: "ON",
    opt_off: "OFF",

    target_prompt: "Select a contact.",
    confirm_blind: "Investigate an unscanned contact?",
    yes: "CONFIRM",
    no: "CANCEL",
  };

  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
