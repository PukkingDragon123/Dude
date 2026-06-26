/* DREADNOUGHT v4 — strings. In-dive state is DIEGETIC (no HUD text); only menus/briefing/end carry text. */
(function (root) {
  "use strict";
  var STR = {
    lang: "en",
    title: "DREADNOUGHT",
    subtitle: "the drowned grid",
    tagline: "Read the dark. Drive the safe path. Do not wake what sleeps between the numbers.",

    menu_dive: "DESCEND",
    menu_help: "BRIEFING",
    menu_options: "SYSTEMS",
    menu_back: "BACK",
    again: "DESCEND AGAIN",

    // end states (full-screen, text allowed here)
    win_title: "THE SOURCE",
    win_body: "The pulses fuse into one long note and the trench floor unfolds like a throat. The signal was a lure and a warning, in a voice older than the ice. The monitor fills edge to edge with a single contact. You found it. It found you first.",
    lose_hull: "THE SEA COMES IN",
    lose_hull_body: "The last seam gives. Black water folds the cabin flat and floods the monitor, and the green light goes out under the weight of the deep.",
    lose_oxygen: "ASPHYXIA",
    lose_oxygen_body: "The air column empties to nothing. The ping keeps sweeping an empty scope for no one as the gauges blur and the dark closes over the glass.",
    end_depth: "Reached {d}m   ·   Hauled ₽{haul}",

    help_title: "BRIEFING",
    help_lines: [
      "The cockpit monitor is a sonar grid of the water around you. Your sub is the lit cell. DRIVE one cell at a time to move — and entering a cell REVEALS it.",
      "A revealed cell shows a number: how many ANGLERS hide in the eight cells around it. Read the numbers, deduce which cells are safe, and carve a path down to the DESCENT HATCH.",
      "PING fires a sonar cone ahead — it reveals the NUMBERS of cells at range without entering them. But a ping is LOUD, and the Anglers MOVE: each move and loud ping can make one slip to a new tile — clearing the flag you set. A solved board can lie.",
      "FLAG a cell you suspect; the sub refuses to drive into it until you insist. Drive into an Angler and it lunges — hull damage, and the cabin floods. Far below stirs THE BLOOP: vast, and patient.",
      "Loot is SIGNALS. Drive onto one and SECURE it: a radar mini-game — catch the jammed signal in the capture window before the timer, while it broadcasts your position into the dark.",
      "No number gauges. Watch the AIR cylinder fall and the WATER rise. Surface to the rig to bank signals and buy gear + plushies. At zero air or a drowned cabin, the dive ends.",
      "Six layers down lies the Source. Reach it — if the math holds and the dark stays asleep.",
    ],
    help_controls: "DRIVE: W A S D / arrows.  PING: Space.  FLAG: F.  LIGHT: L.  CONFIRM / HATCH: E or Enter.  Touch: tap an adjacent cell to drive, hold a cell to flag.  Gamepad supported.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_on: "ON",
    opt_off: "OFF",
  };
  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
