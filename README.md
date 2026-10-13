# Underground Wars

Open `index.html` to play. No install, build step, backend, or external assets.

Deploy the entire folder to GitHub Pages, including `renderer.js` and `vendor/`. All URLs are relative and work under repository subpaths. Three.js is bundled locally, so play does not require a CDN. A browser with WebGL enabled is required.

## Controls

- Space / tap the battlefield: launch a saw.
- WASD / arrows: steer continuously. Touch and drag: steer toward your finger.
- Return to the glowing home base to launch every missile enclosed by this run. There is no per-run capture limit.
- Touch a missile to launch just that missile and sacrifice your saw.
- Green fuel cans add 40 fuel. Fuel drains with distance, even in old tunnels.
- Touch any buried miner to recruit it without losing your saw. There is no per-run recruitment limit. Each miner digs its own tunnel to the surface, marches toward the opposing castle, and strikes once for 5 damage. Recruited miners still attack if your saw is lost. Units resolve before the next turn. Enclosing a miner does not recruit it.
- Five saws per player. Returning safely saves the saw for another run; rocket impacts, exhausted fuel, and boundary crashes permanently destroy it. Turns continue beyond five runs, and a team with no saws is skipped. Destroy a castle to win immediately; if both teams lose all their saws, highest remaining castle HP wins (equal HP is a draw). Each missile deals 10 damage. Both castles start at 100 HP.
- Select VS AI or 2 PLAYERS before a match. Two-player mode shares the controls.
- Music note: toggle synthesized sound effects. Matches have no pause menu; changing window focus clears held controls without pausing the match.

Three.js renders a real 3D diorama with modeled castles, rockets, canisters, animated miners, an extruded spinning saw, recessed excavated tunnels, and 3D impact debris. Shadows are limited to above-ground objects. Large top health bars include segmented fills, delayed damage trails, and numeric HP; large dedicated inventory cards show remaining saws, with individual active, destroyed, and safely returned blade indicators. Inventory cards animate on destruction and show “SAW SAVED” on a safe return; returning preserves the saw for future turns. Each castle’s base circle is a team-colored fuel gauge: its arc drains clockwise with fuel use and refills on pickups, with a fuel percentage badge beside the circle. The inactive base is dimmed, and low fuel flashes. There is no launch button; tap the battlefield or press Space to begin. The win message highlights the winning team's color. Pointer steering raycasts onto the saw plane so the 3D camera does not offset touch controls. Gameplay runs at a fixed simulation step.

Every new match shuffles the resource types and randomizes their positions within spaced slots. The resulting layout is reflected exactly around the arena center: each side has six missiles, one fuel tank, and two miners at identical depths and distances from its base. Positions stay fixed during the match. Spacing prevents overlapping resources. Both players have equal HP, saw speed, fuel consumption, starting fuel, pickup values, and damage. Resources remain neutral and can be reached by either player. The camera is centered and does not favor either side. AI uses ordinary waypoint movement and the same fuel, swept collision, and enclosure rules.

Three.js r160.1 is distributed under the MIT license; see `vendor/THREE-LICENSE.txt`.

Mobile play requires landscape. On supported browsers, Play requests fullscreen and a landscape orientation lock. If locking is unavailable or denied, a “Rotate your phone” screen blocks input and freezes the run until the phone is landscape again. Desktop windows are not orientation-blocked.
