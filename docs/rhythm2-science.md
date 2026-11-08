# Rhythm 2.0: research and decision rules

Reviewed 8 November 2026. This is a targeted evidence review for the ongoing-cycling beta, not an exhaustive
systematic review or a validation of InFlite's coaching outcomes. Published findings inform the design; the numerical
guardrails below are explicit product choices. Dated events and multisport plans still use classic Rhythm.

## Evidence mapped to behavior

| Source | Relevant finding and limits | Rhythm decision |
| --- | --- | --- |
| [Rosenblat et al., 2025, Sports Medicine](https://doi.org/10.1007/s40279-024-02149-3) | Individual-participant network meta-analysis: 13 studies, 348 endurance athletes, including 52 women. No overall advantage of polarized over pyramidal training for VO₂max or time-trial performance. Performance-level subgroup findings support individualization, with uncertainty. | Keep most planned time easy and choose focused work by goal, observed riding and feedback. A universal 80/20 prescription is not justified by this evidence. |
| [Norte et al., 2024, IJSC](https://doi.org/10.47206/ijsc.v4i1.271) | Review of interval training in trained cyclists found benefits, imprecise estimates for many outcomes, and no clear best interval type or work-bout duration. The included training frequency and studied populations limit generalization. | Keep several session families, progress one dose component, retain recovery and compare like-for-like reviews. Session difficulty is interpreted in its training context. |
| [Schoenmakers et al., 2026, BMC Sports Science, Medicine and Rehabilitation](https://doi.org/10.1186/s13102-026-01766-x) | Across 86 articles and 239 protocols, longer work bouts were associated with greater acute time near VO₂max. The relationship between that acute response and long-term adaptation remains uncertain. | Retain repeatable multi-minute aerobic intervals and allow small duration progressions. Do not estimate actual time at VO₂max from FTP, or claim a guaranteed performance gain from a particular interval format. |
| [Schaffarczyk and Sperlich, 2026, Frontiers in Sports and Active Living](https://doi.org/10.3389/fspor.2026.1858271) | A critical narrative/SWOT review emphasizes trends, measurement consistency, context and transparent multimodal decisions. HRV is nonspecific; evidence does not establish a universally superior HRV-based prescription. | Combine the existing personal HRV trend, sleep debt, corroborating resting-HR changes and rider check-in. An isolated outlier cannot automatically cancel quality work. |
| [Saw, Main and Gastin, 2016, BJSM](https://doi.org/10.1136/bjsports-2015-094758) | This foundational systematic review supports repeated subjective monitoring of training response; the reviewed measures had published validity/reliability. It does not validate InFlite's custom check-in or review scale. | Use subjective fatigue as supporting context alongside riding evidence. Keep the beta's own questions and numerical triggers identifiable as heuristics. |

The 2025 cycling-specific review by [Cove et al.](https://doi.org/10.1016/j.jsams.2024.12.005) was also checked
through its indexed abstract: polarized and non-polarized interventions showed comparable average improvements.
The publisher's full text was not accessible during this review. Its findings reinforce individualized distribution
and consistency rather than automatic increases in training volume.

## Implementation choices, not research-derived cutoffs

- **Dose progression:** two controlled reviews on distinct ride dates at the same dose are required. Eligible
  evidence is at most 42 days old, belongs to the same family and uses FTP settings within 2%. Reviews are ordered
  by the session date, not the insertion time. Future sessions and traffic, time or equipment interruptions do not
  unlock progression. Missing or ambiguous power matching cannot count as successful objective evidence.
- **Perceived effort:** the custom whole-session scale runs from 1 (very easy) to 10 (maximal). The controlled-review
  ceiling is 7 for threshold/durability and 8 for hard aerobic/controlled sprint work. A completed aerobic-interval
  session rated 9 holds its dose; 10, reduced work or a reduced power assessment reduces it. These are conservative
  defaults, not validated physiological boundaries. Completed fatigue reports never unlock progression.
- **Small steps and ceilings:** threshold/durability work bouts grow by 30 seconds; aerobic-interval bouts by 15
  seconds; controlled sprints by one repetition. Intensity does not increase simultaneously. Total work ceilings
  are 40, 20, 2 and 30 minutes respectively, with aerobic bouts capped at five minutes. A tight time slot can reduce
  repetitions; the actual fitted dose becomes the evidence for the next comparison. At a ceiling, consolidate.
- **Training balance:** newly generated intervals are limited to 20% of the weekly time allowance, or 25% for
  sustained-power focus. This is a planning guardrail, not a measured three-zone intensity distribution. Warm-ups,
  recoveries, cool-downs and endurance steps comprise the remaining planned time. When available, actual power-zone
  time at or above 90% FTP is charged against the allowance; unknown zone data is not invented. Hard-day spacing
  and training-load limits also apply. Time at FTP percentages does not identify a rider's LT1/LT2.
- **Rolling frequency:** at most one focused day for sparse history/endurance focus, otherwise two, in any seven
  local calendar days. The existing roughly 48-hour spacing is retained as a scheduling heuristic. Actual and
  reviewed hard rides count alongside planned sessions, preventing a Monday reset from creating a dense block.
- **Recovery context:** a poor check-in, established low HRV trend, repeated short sleep, or elevated resting HR
  corroborated by low HRV/short sleep can ease today. Two fatigue reviews on distinct days in the last seven days
  pause newly generated quality work until seven days after the latest such ride. The period expires naturally;
  this is not a diagnosis of overtraining. Sparse/missing readings never become positive readiness evidence.
- **Volume:** the existing maximum 5% allowance above observed weekly time/load is unlocked only by two recent
  controlled review dates within 14 days, with no current recovery concern and build mode selected. Otherwise
  maintain the observed allowance. Neither 5% nor TSS/CTL/ATL is an injury-risk guarantee or a physiological test.
- **Endurance labels:** “long” is used only when the fitted session lasts at least two hours. A longest available
  slot can shrink under the weekly limits; its shorter session is called an endurance ride. This is a wording
  convention, not a physiological boundary or an instruction to increase riding time. Older saved generic labels
  are corrected for display without changing the stored prescription, its steps or watt targets.

## Stability and interpretation

All changes run in the existing lazy planner; classic users incur no new planner requests. Recorded prescriptions
retain their steps and absolute watt targets. Historical unrecorded workout IDs also decode their original doses,
even if they exceed today's generation ceilings. Existing prescriptions and explicit manual overrides take priority
over automatic rules, so they can exceed a newly suggested limit. The rider can replace a session with rest/easy work.
Reduced sessions awaiting an activity file use the prescription's load as a conservative estimate until actual riding
is available; the UI does not present that estimate as a measured physiological response.

Garmin and Apple Health retain the app's existing single-provider recovery history; RMSSD and SDNN are not pooled.
The current HRV baseline implementation is reused, without relabeling device metrics as a standardized laboratory
measurement. Variable field conditions, incomplete activity imports, non-maximal efforts and unrecorded life stress
all limit inference. Field interval matching and long-term outcome validation remain important next stages.

Regression checks cover stale/mismatched reviews, session-order changes, ceilings, fractional-minute names, old IDs,
single outliers, corroborated/trending recovery signals, fatigue expiry, rolling hard-day limits, work-minute budgets,
growth gating and retained watt targets. The original explanatory UI was replaced in 2.18 by a single Experimental setting. Sources and decision rules
remain documented here; existing reviews are retained. Browser checks cover the toggle, persisted state, workout
downloads, error recovery and narrow-phone/desktop layouts.
