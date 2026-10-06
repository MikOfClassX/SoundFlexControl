# Task 7 viewport reference

Reference: `soundflex.png`, 3840×2160. Approximate measurements (image edges and native borders vary by a few pixels):

| Region/control | Reference pixels | Layout rule |
|---|---:|---|
| Native title bar | 60 high | 60 scaled pixels, web minimum 34 |
| Preview/channel controls region | 138 high | 138 scaled pixels, web minimum 56 |
| Output bank | 326 wide | 326 scaled pixels, minimum 100 |
| Input strip (24 inputs, 12 columns) | roughly 274 wide | equal fractional columns; width/viewport ratio roughly .071 |
| Strip gap | roughly 10 | 10 scaled pixels, minimum 3 |
| Preview knob | roughly 116 square | 116 scaled pixels, minimum 48 |
| Input title and control buttons | roughly 80 high | 80 scaled pixels; title minimum 26, button minimum 22 |
| Fader thumb | roughly 40×88 | scaled together, minimum 14×28 |

A scaled pixel is `min(viewport width / 3840, viewport height / 2160)` CSS pixels. Equal-height strip rows consume the remaining browser area; input columns use the discovered supported slot count. Control widths are capped so two-input installations do not inflate meters/buttons. Readability floors intentionally relax exact reference ratios on laptop sizes.

The reference includes the Windows taskbar and partially obscures the lower strips. Neither the taskbar nor this clipping is reproduced: the web layout exposes the complete bottom row inside the browser viewport. Connection/status controls are web-specific additions in the title bar; settings and error panels remain temporary overlays.

Validation: `npm run test:layout` measures real Edge rectangles and containment for mixer regions, strips, meters, faders, titles, channel buttons and strip buttons. It checks two-row composition and document scroll bounds at six resolutions with 2, 16 and 24 inputs. At the four desktop/laptop target resolutions, output-bank and 24-input strip width ratios allow absolute tolerances of .012 and .008 respectively. Firefox screenshots are visual validation only. Mobile widths ≤650px retain the previously approved internal-scroll exception.
