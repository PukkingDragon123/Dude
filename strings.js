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
      "A revealed cell shows a number: how many MONSTERS hide in the eight cells around it. Read the numbers, deduce which cells are safe, and carve a path down to the DESCENT HATCH.",
      "PING fires a sonar cone ahead — it reveals the NUMBERS of cells at range without entering them, so you can solve before you commit. But a ping is LOUD: it wakes the things below, and a woken hunter will close on you across the grid.",
      "FLAG a cell you believe hides a monster; the sub will refuse to drive into it until you insist. Drive into a monster and it takes the hull — and the cabin starts to flood.",
      "There are no gauges of numbers. Watch the AIR cylinder fall, and the WATER rise: when the hull is breached the cabin leaks, then floods. At zero air or a drowned cabin, the dive ends.",
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
