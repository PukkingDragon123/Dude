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
    lose_hull_body: "The leaks win. Black water folds the cabin flat and floods the monitor, and the green light goes out under the weight of the deep. Sergey Volkov keeps the valve warm now, for whoever comes after.",
    lose_mine: "DETONATION",
    lose_mine_body: "One wrong cell. The iron sown under the trench wakes, and the dark turns white and then black. There was a number that told you. You read it wrong. The deep does not give second readings.",
    lose_oxygen: "ASPHYXIA",
    lose_oxygen_body: "The air column empties to nothing. The ping keeps sweeping an empty scope for no one as the gauges blur and the dark closes over the glass. You stay. They all stayed.",
    end_depth: "DN-7 LOST AT {d}M   ·   THE TRENCH KEEPS ANOTHER",

    help_title: "BRIEFING",
    help_lines: [
      "You are Sergey Volkov, alone in the bathysphere DN-7. Command lowered you down the trench to find the pulse that took K-219 and her forty-one men. The cable is cut. The only way out is DOWN, to the Source. Just survive the descent.",
      "The monitor is your sonar. Your sub is the lit cell. DRIVE one cell at a time — entering a cell REVEALS it. A number = how many MINES are buried in the eight cells around it. Read the numbers and deduce the safe path to the DESCENT HATCH.",
      "Drive onto a MINE and it DETONATES — instant death. There is no second chance and no recovery. PING sounds the safe dark ahead without moving (it never reveals a mine). FLAG what you fear; the hull won't drive onto a flag unless you press toward it twice.",
      "The deep CRUSHES the hull. PRESSURE springs LEAKS — and you can only see WHERE a leak is by LOOKING OUT the window. While your face is at the glass you CANNOT read the radar or drive. PATCH the leak, then get back to the sonar. The water never stops rising on its own.",
      "AIR only ever DRAINS — there is no vent, no refill, and it falls faster the deeper you go. Watch the cylinder empty; that is your whole clock. The VALVE WHEEL is your winch: reach the hatch and CRANK to descend. There is no surface to crank back to.",
      "The RADIO is your only company. Command up top; static, the dead crew of K-219, and the Source itself below, wearing your own voice. Six layers down it is waiting. Reach it — if the math holds, and the hull holds, and your air lasts.",
    ],
    help_controls: "DRIVE: W A S D / arrows.  PING: Space.  FLAG: F.  LOOK OUT / RADAR: Q or L.  PATCH a leak (at the window): P.  CRANK to descend: C.  Touch: tap a control, tap an adjacent cell to drive, hold a cell to flag.  Gamepad supported.",

    options_title: "SYSTEMS",
    opt_sound: "SOUND",
    opt_shake: "SCREEN SHAKE",
    opt_scanlines: "CRT SCANLINES",
    opt_on: "ON",
    opt_off: "OFF",
  };
  root.STR = STR;
})(typeof window !== "undefined" ? window : this);
