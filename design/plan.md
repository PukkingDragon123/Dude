# DREADNOUGHT — Design Plan

A horror roguelike deckbuilder. You pilot a small Russian submarine, the *Dreadnought*,
into an abyssal trench to trace the source of a strange signal. Read the dark with sonar,
spend scarce cards to identify what waits there, then decide whether the unknown is worth
the oxygen, hull and sanity it will cost to investigate.

Inspirations: the claustrophobic instrument-panel dread of *Iron Lung*; the
identify-before-you-touch loop and creeping ocean horror of *DREDGE*.

## Profile (axes)
- **Time** turn-based (descend node-to-node; encounters resolved in card turns).
- **Space** discrete depth ladder of contacts + abstract card resolution.
- **Agency** one vessel and its crew (disembodied command).
- **Conflict** vs system (trench, monsters, attrition) + vs self (sanity, risk).
- **Content** procedural run (seeded) over an authored signal mystery.
- **Outcome** win (reach the signal source and survive) / lose (any vital hits 0); roguelike runs.
- **Players** solo.
- **Session** ~10–25 min per dive.
- **Engagement** discovery (primary) + calculation (primary) + dread/story (secondary).

## Experience formula
The player feels fragile dread because the game constantly forces them to spend
limited resources to reveal threats that may be worse than the dark they came from.

## Core loop
1. **Descend** to the next depth band — costs oxygen, advances the run.
2. **PING** to reveal the band's contacts as unknown blips on the sonar.
3. **SCAN** a blip to identify it (wreck / artifact / creature / anomaly) and its threat.
4. **Decide**: INVESTIGATE for reward (cards, salvage, lore), EVADE the dangerous,
   or descend past it. Acting without scanning is a gamble.
5. Manage **hull / oxygen / sanity** with repair, vent and steady cards; **power** is the
   per-turn action budget. Low sanity corrupts the sonar (false blips).
6. Reach the trench floor → the source, the Leviathan, and the truth.

## Verbs (the deck)
PING (reveal), SCAN (identify), INVESTIGATE (commit/resolve a contact), EVADE (avoid a
threat), BRACE/REPAIR (hull), VENT/SCRUB (oxygen), STEADY (sanity), plus salvaged cards.
Strong verbs: SCAN/INVESTIGATE resolve differently per contact type.

## Information map
Contacts begin as unknown blips. PING reveals position/proximity; SCAN reveals identity and
threat tier; investigating unscanned = blind risk. At low sanity the scope shows phantom
blips — a discoverable trail (the log warns when sanity is low), never silent cheating.

## Ten-subsystem walkthrough (summary)
1. **Representation** cockpit frame; central CRT sonar scope; gauges around it; hand at the
   bottom; depth ladder at the side. Current-decision info never hidden.
2. **Input** click/tap cards then target; keys 1–9 play card by slot, arrows pick target,
   Space/Enter descend/end turn, H help; gamepad maps to the same commands. No hover-only.
3. **Agency metrics** frozen in `thresholds.md` before content.
4. **Resistance × verb** every threat has an answering verb (unknown→ping/scan, hull→repair,
   O2→vent, sanity→steady, monster→evade/scan-to-predict, locked artifact→power).
5. **Peaks** each depth threshold forces a dangerous contact; the floor is the Leviathan exam.
6. **Rewards** feed discovery+accumulation; strongest reward is a new card (verb); big
   rewards sit on depth peaks.
7. **Interface** every gauge/card serves a decision; cards show cost + effect; blips show
   known/unknown state.
8. **Economy** power (per-turn, regen) ; oxygen (sink: descend/actions, source: vent cards);
   hull (sink: damage, source: repair); sanity (sink: anomalies/dark, source: steady/safe);
   cards (source: scan/investigate, sink: one-use consumables).
9. **Delivery** one pattern at a time across band 1: forced ping → scan → safe wreck →
   first creature; situation-taught, minimal text.
10. **Entry** title (dive klaxon) → short log → first contact within seconds; on return the
    HUD shows depth + goal; help overlay on demand; options before play.

## Visual style
PS1-era low-poly look delivered as 2D pre-rendered art + procedural CRT canvas FX (we are
NOT spinning up a realtime 3D engine for a card game — the PS1 aesthetic is carried by the
art style, dithering, low-res crunch, vertex-lit palette and CRT overlay). The single STYLE
FORMULA below is embedded byte-identical in every generated and procedural asset.

## Assets
See `design/assets.csv`. Generated: 3 backgrounds + 6 contact sprites + 2 music + 5 SFX.
Procedural (canvas, embed the formula): sonar scope, gauges, card frames, post overlay.
