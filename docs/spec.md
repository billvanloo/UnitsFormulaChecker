# 06. Units and Formula Checker

New tool. Supports supplements S1 (units) and S2 (rearranging formulas) across all modules. Mockup: `mockups/06-units-formula-checker.html`.

## 1. Purpose

Students write a calculation the way they would on paper, one line at a time, with units on every number. The tool tracks the physical dimensions through each step, converts units, flags steps that cannot be right, and names common mistakes. It catches the errors that sink most early example problems: mixing N·mm with N·m, using rpm where rad/s belongs, or adding quantities that are not the same kind.

### Learning targets

Students can:

1. Attach units to every quantity and carry them through a calculation.
2. Convert between SI prefixes and between SI and US customary units.
3. Recognize when two quantities cannot be added or compared.
4. Check that a formula's result has the expected unit before trusting the number.
5. Rearrange a formula for a chosen variable.

## 2. Scope

In version 1: a line-by-line worksheet, a unit parser, dimension tracking, conversion, a formula library from the unit plan, a rearrange helper for single-occurrence variables, mistake detectors, and an export.

Not in version 1: symbolic algebra beyond rearranging formulas where the unknown appears once, calculus, uncertainty propagation (planned later for lab data).

## 3. Model

### 3.1 Dimensions

Track exponents of mass M, length L, time T, temperature Θ, current I. Angle is dimensionless, but carry an "angle" tag so the tool can tell rad/s from 1/s and warn when degrees are used in a formula that needs radians.

Quantity kinds share dimensions but are shown differently: torque (N·m) and energy (J) are both M L² T⁻². The student can tag a line's kind; the tool then displays the matching unit and warns if a torque is added to an energy.

### 3.2 Units supported

- Length: m, mm, cm, km, µm, in, ft
- Mass: kg, g, lb (mass)
- Force: N, kN, mN, lbf, ozf, kgf
- Torque: N·m, N·mm, N·cm, lbf·in, lbf·ft, ozf·in, kgf·cm
- Pressure and stress: Pa, kPa, MPa, GPa, psi, ksi, N/mm²
- Energy: J, kJ, N·m (when tagged energy), ft·lbf
- Power: W, kW, hp
- Speed and rotation: m/s, mm/s, ft/min, rpm, rev/s, rad/s, deg/s
- Angle: rad, deg, rev
- Time: s, min, h
- Temperature change: °C, K (differences only; flag absolute temperatures used in a difference-only formula)
- Specific heat: J/(kg·°C), J/(kg·K)
- Compound units by multiplication, division and integer powers, typed with `*`, `/`, `^`, `·` or a space.

### 3.3 Exact definitions for conversion

1 in = 0.0254 m. 1 ft = 12 in. 1 lb = 0.45359237 kg. g₀ = 9.80665 m/s² for unit definitions only. 1 lbf = 4.4482216152605 N. 1 ozf = 1/16 lbf. 1 kgf = 9.80665 N. 1 hp = 33,000 ft·lbf/min. 1 psi = 1 lbf/in². 1 rev = 2π rad. 1 rpm = 1 rev/min. Show these in help. Calculations in the unit use g = 9.81 m/s²; if a student types g, the tool uses 9.81 m/s² and says so.

### 3.4 Worksheet lines

Each line is one of:

- A given: `P = 500 W`
- A computed step: `omega = 2*pi*N/60` or `T = P/omega`
- A target check: `T in N·m` (asks for the result in a unit and checks dimensions)

Variables are case sensitive. Greek names can be typed as words (omega, tau, sigma, mu, theta, eta, phi, lambda) and display as symbols. Functions: sqrt, cbrt, sin, cos, tan, atan, asin, acos, exp, ln, abs. Constants: pi, e, g.

### 3.5 Checks and mistake detectors

| Check | Rule | Message example |
|---|---|---|
| Add or subtract mismatch | Dimensions differ | "You are adding a force (N) to a length (mm). These cannot be added." |
| Function argument | sin, cos, tan, exp, ln need dimensionless input; trig accepts angles | "tan needs an angle or a ratio. 4 mm is a length." |
| Degrees in radian formula | Degree quantity used in ω, P = τω, arc length or e^(μθ) | "e^(μθ) needs θ in radians. Converted 180° to 3.14 rad." |
| rpm used as rad/s | Quantity in rpm used in P = τω or v = ωr | "N is in rpm. P = τω needs rad/s. Multiply by 2π/60." Converts and continues |
| Mixed length prefixes in stress | N·mm with m² or N·m with mm² in the same step | Converts and notes the conversion |
| Target unit mismatch | Result dimensions differ from requested unit | "This result is a torque. You asked for it in MPa." |
| Temperature | Absolute temperature used in Q = mcΔT | "Q = mcΔT uses a temperature change. Use ΔT." |
| Percent | Percent used where a fraction is needed (efficiency) | "Efficiency 90% is 0.90 in this formula." |

### 3.6 Formula library

Pick a formula from the unit plan to insert as a line, with its variable names and source shown. The library ships with the unit's equations: τ = rF, ω = 2πN/60, P = τω, P = Fv, i = z₂/z₁, d = zm, a = m(z₁ + z₂)/2, F_t = 2T/d, F_r = F_t tan α, tan λ = l/(π d_m), η = W l/(2π T), σ = F/A, σ = 32M/(π d³), τ = 16T/(π d³), KE = ½ I ω², Q = m c ΔT, T_e = μ g (m′_b + m′_p) L + m′_p g H, T₁/T₂ = e^(μθ).

### 3.7 Rearrange helper

For a formula where the chosen unknown appears once, show the rearranged form step by step (undo operations in reverse order). If it appears more than once, say "This one needs algebra the helper does not do yet" rather than guessing.

## 4. Interactions

1. Type a line and press Enter. The line shows its value in chosen display units, its dimensions, and a check mark or a flag.
2. Click a flag to see the explanation and a suggested fix. Apply fix rewrites the line.
3. Change display units per line from a dropdown that only lists compatible units.
4. Insert from the formula library. Rearrange from the library entry's menu.
5. Export worksheet as text (copyable into a calc sheet), PNG, or report.

## 5. Test cases

| ID | Worksheet | Expected |
|---|---|---|
| UF-1 | `P = 500 W`, `N = 300 rpm`, `T = P/N`, `T in N·m` | Flag: rpm used in place of rad/s. After fix: ω = 31.4 rad/s, T = 15.9 N·m |
| UF-2 | `T = 10 N·m`, `tau = 50 MPa`, `d = cbrt(16*T/(pi*tau))`, `d in mm` | d = 10.1 mm (10.06). No flags |
| UF-3 | `a = 5 N + 2 m` | Add mismatch flag. No value |
| UF-4 | `x = tan(4 mm)` | Function argument flag |
| UF-5 | `1 hp in W` | 745.70 W |
| UF-6 | `85 N·cm in N·m` | 0.85 N·m |
| UF-7 | `1 MPa in N/mm^2` | 1 N/mm² |
| UF-8 | `Q = 3000 J`, `m = 1 kg`, `c = 452 J/(kg·°C)`, `dT = Q/(m*c)` | ΔT = 6.64 °C (6.637) |
| UF-9 | `100 lbf·in in N·m` | 11.3 N·m (11.298) |
| UF-10 | `mu = 0.3`, `theta = 180 deg`, `k = exp(mu*theta)` | Degree flag, converts: k = 2.57 |
| UF-11 | `T = 2 N·m`, `E = 3 J`, `x = T + E` with T tagged torque, E tagged energy | Kind warning: same dimensions, different quantity kinds |
| UF-12 | Rearrange `tau = 16*T/(pi*d^3)` for d | d = ∛(16 T / (π τ)) with steps shown |
| UF-13 | Rearrange `T_e = mu*g*(mb + mp)*L + mp*g*H` for mp | Helper declines: mp appears twice |
| UF-14 | `eta = 90 %`, `Pout = eta*Pin` | Percent note, uses 0.90 |

## 6. Acceptance criteria

- [ ] All test cases pass in Node (parser, dimensions, conversion, detectors) and in the interface.
- [ ] Every conversion constant traces to section 3.3 and is listed in help.
- [ ] A worksheet of 30 lines recalculates in under 50 ms.
- [ ] Screen readers announce each line's result and any flag.

## 7. Sources

- Unit definitions: section 3.3 (exact definitions of the inch, the avoirdupois pound and standard gravity). The horsepower equivalence 33,000 ft·lbf/min appears in PackagingConveyor.com and Rulmeca conveyor references: https://packagingconveyor.com/resources/conveyor-design-guide/conveyor-engineering/
- OpenStax University Physics Vol. 1, 10.8 (rev/min to rad/s example): https://openstax.org/books/university-physics-volume-1/pages/10-8-work-and-power-for-rotational-motion
- Formula library sources: as cited in the unit plan and files 01 to 05.
