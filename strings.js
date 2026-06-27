/* DREADNOUGHT v4 — strings. In-dive state is DIEGETIC (no HUD text); only menus/briefing/end carry text. */
(function (root) {
  "use strict";
  var STR = {
    lang: "en",
    title: "DREADNOUGHT",
    subtitle: "the drowned grid",
    tagline: "PILOT: SR. MICHMAN SERGEY VOLKOV.  Bathysphere DN-7. The cable is cut. There is no turning back — only down, to the Source, or the dark keeps you.",

    menu_dive: "BEGIN DESCENT",
    menu_help: "BRIEFING",
    menu_options: "SYSTEMS",
    menu_back: "BACK",
    again: "DESCEND AGAIN",

    // end states (full-screen, text allowed here)
    win_title: "THE SOURCE",
    win_body: "The floor unfolds like a throat and the pulse becomes one long note — in your own voice. K-219 was never lost; it arrived. So have you. The Motherland will call you missing. You are not missing, Sergey. You are home.",
    lose_hull: "THE SEA COMES IN",
    lose_hull_body: "The last seam gives. Black water folds the cabin flat and floods the monitor, and the green light goes out under the weight of the deep. Sergey Volkov keeps the valve warm now, for whoever comes after.",
    lose_oxygen: "ASPHYXIA",
    lose_oxygen_body: "The air column empties to nothing. The ping keeps sweeping an empty scope for no one as the gauges blur and the dark closes over the glass. You stay. They all stayed.",
    end_depth: "DN-7 LOST AT {d}M   ·   THE TRENCH KEEPS ANOTHER",

    help_title: "BRIEFING",
    help_lines: [
      "You are Sergey Volkov, alone in the bathysphere DN-7. Command lowered you down the trench to find the pulse that took K-219 and her forty-one men. The cable is cut. The only way out is DOWN, to the Source.",
      "The monitor is your sonar. Your sub is the lit cell. DRIVE one cell at a time — entering a cell REVEALS it. A number = how many ANGLERS hide in the eight cells around it. Read the numbers; deduce the safe path to the DESCENT HATCH.",
      "PING sounds the dark ahead without moving — but it is LOUD, and the Anglers MOVE: each shift can slip one to a new tile, clearing the flag you set. A solved board can lie. FLAG what you fear; the hull won't drive a flag unless you insist.",
      "SIGNALS are transmissions from the lost. SECURE one in the radar mini-game: it vents an AIR cache and decodes a fragment of the truth onto the radio. There is no money, no shop. Air is your only resource, and your leash.",
      "No gauges read numbers. Watch the AIR cylinder fall and the WATER rise as the hull is struck. You sit inside a steel TUBE — LOOK AROUND (drag the hull) to read the instruments, the depth dial, and the VALVE WHEEL you CRANK to descend. Things swim past the window.",
      "The RADIO is your only company. Command up top; static, the dead crew, and the Source itself below. The deeper you go, the less it can be trusted. Six layers down it is waiting. Reach it — if the math holds and your mind does too.",
    ],
    help_controls: "DRIVE: W A S D / arrows.  PING: Space.  FLAG: F.  LIGHT: L.  SECURE: E.  CRANK: C.  PATCH: P.  LOOK AROUND THE CABIN: drag the hull / right stick.  Touch: tap a control, tap a cell to drive, hold to flag, drag the hull to look.  Gamepad supported.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_on: "ON",
    opt_off: "OFF",
  };
  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
