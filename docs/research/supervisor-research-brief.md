# Mélange: research foundation and supervisor pitch

Prepared for a BSc Information Technology final-year project · 11 September 2026

This brief connects the existing implementation to research, distinguishes its contribution from comparable services, and proposes an evaluation plan. It is a focused literature and product review, not a systematic literature review or evidence of customer demand. The university's proposal template and assessment rubric have not yet been supplied.

Repository reviewed: `C:/Users/Joel Ago/Desktop/melange-main/melange-main`. Statements about implementation come from source inspection and existing reports; the deployed application and simulations were not rerun for this brief. Existing application changes were left untouched.

## 1. Recommended project framing

**Proposed title:** Design and Evaluation of Mélange: A Trust-Aware Errand Marketplace with Explainable Runner Matching and Constrained Errand Sharing in Accra.

**One-sentence idea:** Mélange investigates how an errand platform can select suitable runners using behavioural trust and operational constraints, and combine compatible requests while preserving each customer's delivery and dispute records.

**Main research contribution:** an implemented, explainable runner-selection method with reproducible comparisons against simpler selection strategies.

**Supporting contribution:** an online algorithm for pairing two compatible errands under explicit waiting, detour, and deadline constraints.

**Enabling information system:** buyer, runner, and administrator workflows; verification; communication; proof of delivery; simulated settlement; and auditable task transitions. These make the research demonstrable in a realistic workflow.

For this BSc IT proposal, this scope offers a coherent connection between requirements analysis, databases, algorithms, security, interface design, and evaluation. Final approval of academic scope remains with the supervisor. Accra is the proposed study context because the implementation uses Accra geography and time conventions; a particular neighbourhood or campus has not been selected.

### Suggested problem statement

People delegating local errands need to decide whom to trust, whether that person can fulfil the request, and what should happen if delivery is disputed. Selecting only the nearest runner overlooks reliability and workload, while selecting only by reputation can overlook travel time. Combining requests introduces a further trade-off between route efficiency and acceptable waiting or detour.

Mélange therefore investigates whether an explainable combination of trust, estimated pickup time, and workload can improve runner selection under a declared evaluation model, and whether compatible errands can be paired while satisfying explicit service constraints. Existing Ghanaian services establish that delivery and errand platforms already exist; local interviews are still needed to establish which difficulties intended users experience and whether this approach addresses them.

## 2. Relevance and supporting evidence

### Trust is a researchable service problem

Cebeci et al. (2023) used a stated-choice experiment and hybrid choice model to investigate trust in crowdshipping adoption. Their results support treating trust as relevant to service choice. However, their Netherlands sample and hypothetical choices do not establish demand in Accra or validate Mélange's scoring formula. The useful connection is the decision to investigate trust alongside operational service attributes. [Research paper](https://doi.org/10.1016/j.tra.2023.103622)

Mélange is more accurately described as an **errand marketplace with request consolidation** than as a pure commuter-crowdshipping platform: its implementation does not require runners to be making a pre-existing personal journey. Crowdshipping literature supplies related concepts, with this difference made explicit.

### Ghana provides a relevant digital context

The Bank of Ghana's *Payment Systems Oversight Annual Report 2025*, section 5.1, reports **26.6 million active mobile-money accounts** in 2025. This supports the relevance of researching services within a substantial digital-payments ecosystem. Accounts are not unique people or prospective customers, and this statistic is not an errand-market size estimate. Mobile-money integration would be future work: Mélange currently uses non-redeemable demo balances. [Bank of Ghana report](https://www.bog.gov.gh/wp-content/uploads/2026/08/Payment-Systems-Annual-Report-2025-1.pdf)

Ghana Statistical Service's 2023 thematic brief, based on the **2021 census**, reports that **31.4% of persons aged six and above had not used the internet in the preceding three months**. This is historical evidence of digital exclusion, not a 2026 adult smartphone statistic. It motivates testing device access, data costs, and usability rather than assuming an app reaches everybody. [GSS digital-exclusion brief](https://census2021.statsghana.gov.gh/newspage.php?Release-of-the=&readmorenews=MjUwNzE4NDkzNS43Njc1)

### Runner welfare belongs in the evaluation

Fairwork's Ghana research documents concerns about pay, working conditions, contracts, and platform management in the platforms it studied in 2022. This supports including runner perspectives and opportunities to challenge adverse decisions. It does not prove Mélange creates fair work, nor describe every platform's current practices. [Fairwork Ghana 2022 report](https://fair.work/wp-content/uploads/sites/17/2022/11/221103_fairwork_ghana-report-2022_RZ.pdf)

### Consolidation offers a question to test

Dahle et al. (2019) study pickup-and-delivery with time windows and occasional drivers. Their work provides a foundation for considering feasibility constraints alongside routing benefits. Mélange uses a much smaller problem and a different operating model; published savings from that paper cannot be transferred to this project. [Routing research](https://doi.org/10.1016/j.cor.2019.04.023)

The practical hypothesis is that compatible requests may share some travel. Whether that reduces actual cost, waiting, or emissions depends on road routes, runner positioning, demand density, vehicle type, and behaviour. None of those benefits is yet established in the field.

## 3. Literature map: what each source justifies

| Research | Relevant idea | Application in Mélange | What it does not establish |
|---|---|---|---|
| [Cebeci et al., 2023](https://doi.org/10.1016/j.tra.2023.103622) | Trust in service adoption | Study trust and reliability, rather than treating location as the only criterion | Ghanaian adoption, this trust formula, or its weights |
| [Jøsang & Ismail, 2002](https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf) | Beta-distribution reputation and feedback aggregation | A statistical foundation for smoothing completion history when evidence is sparse | The accuracy of Mélange's entire composite trust score |
| [Dahle et al., 2019](https://doi.org/10.1016/j.cor.2019.04.023) | Pickup-and-delivery feasibility with time windows | Preserve pickup-before-drop-off order and check deadlines | Global optimality of greedy pairing |
| [Silva et al., 2021](https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2021.12) | Exact strategic optimization under uncertain supply and demand | A stronger research comparator and motivation to study uncertainty | A requirement to implement an industrial optimizer for this prototype |
| [Rudin, 2019](https://www.nature.com/articles/s42256-019-0048-x) | Prefer interpretable models for consequential decisions where suitable | Explicit scoring components and inspectable rules | Automatic fairness or empirical accuracy of a transparent rule |
| [Peffers et al., 2007](https://doi.org/10.2753/MIS0742-1222240302) | Design Science Research Methodology | Organize problem identification, design, demonstration, and evaluation | That building an application alone answers a research question |

The original Beta Reputation System supports the use of positive and negative evidence in a statistical reputation model. Mélange adapts that idea within a larger weighted formula. Its 30-day half-life, verification bonus, and additional components remain project assumptions requiring evaluation. [Original paper](https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf)

Rudin's argument supports choosing an interpretable approach; it is not evidence that machine learning is always unsuitable. The project-specific reason to begin with a transparent baseline is that the reviewed repository supplies simulations rather than a representative labelled history for training a predictor. [Interpretability paper](https://www.nature.com/articles/s42256-019-0048-x)

## 4. Why the major features and technical choices exist

The explanations below are defensible rationales reconstructed from the implementation and research. They should not be presented as proof that these sources were consulted before the code was written. Where a design preceded the literature review, describe the research as informing its subsequent evaluation and refinement.

| Existing choice | Problem it addresses and rationale | Boundary or evaluation needed |
|---|---|---|
| Buyer, runner, and admin roles | Different responsibilities require different actions and access | Test cross-role authorization and whether users understand each workflow |
| Multiple errand categories | Supports purchasing and collection as well as parcel movement | Breadth is a product choice; interviews should identify the most important categories |
| Availability, verification, and capability checks | Suitability must be considered before preference ranking | Verification is an admin-review workflow, not demonstrated integration with a national identity authority; empty capability lists currently act as unrestricted in the pure matcher |
| Composite trust | Completion, disputes, ratings, and responsiveness provide different behavioural signals | Validate predictive usefulness and attribution of cancellations/disputes; historical disadvantage can propagate |
| Bayesian completion smoothing | A new runner has little evidence; one outcome should not imply certainty | The prior and verification bonus are assumptions, not measured probabilities |
| Time decay | Older behaviour gradually contributes less, allowing scores to respond to change | Compare half-lives, including no decay; monitor strategic abuse and sparse histories |
| Weighted runner matching | Balances trust with operational suitability | Current weights are simulation-calibrated; local superiority is unproven |
| ASAP, Today, and Whenever | Allows different urgency expectations | Distinguish pickup targets from completion deadlines; interview users about acceptable waiting |
| Two-errand sharing | Investigates consolidation while keeping route decisions inspectable | Greedy partner selection; exact route enumeration only inside a candidate pair |
| Separate buyer records within a shared trip | Delivery proof, refunds, ratings, and disputes can differ for the two customers | Demonstrate cancellation and dispute handling for one member without corrupting the other |
| Chat, location, and notifications | Helps parties coordinate and understand progress | Assess usefulness and privacy; device location is evidence, not proof of honesty |
| Proof of delivery and ratings | Produces evidence for completion and later service assessment | A photo and GPS proximity cannot prove correct contents, condition, or handover |
| Rule-based fraud checks | Explicit anomalies can be reviewed without a trained classifier | Risk is a heuristic, not a calibrated fraud probability; measure false positives |
| Rule-based dispute handling and human escalation | Records a reason for straightforward decisions and routes ambiguous cases for review | Rule confidence constants are not measured accuracy; wrong automatic releases/refunds need explicit evaluation |
| Demo wallet and escrow workflow | Demonstrates holding, releasing, refunding, and auditing value during task transitions | Demo GHS 1,000 per account is non-redeemable; no real payments or regulated escrow service |
| Recurrence, tips, earnings views, and administration tools | Supports repeated use and operational demonstrations | Supporting features, not separate research contributions unless user evidence warrants it |
| Next.js/TypeScript with a managed backend | A bounded implementation keeps attention on the research contribution | Engineering judgement; no evidence this stack is uniquely best or faster than alternatives |
| PostgreSQL transactions | Related state changes should succeed or fail together, particularly assignment and simulated settlement | Verify retry and concurrency behaviour; database use alone does not prove correct transactions |
| Row-level security plus server authorization | Separates users' records and constrains permitted operations | Privileged roles can bypass RLS, so server checks and credential boundaries still matter |
| Pure algorithm modules | Separates decision logic from infrastructure for reproducible testing | Reproducibility does not establish realistic assumptions |
| Installable web interface | Provides a browser-accessible deployment and app-like entry point | Current service worker handles push and removes legacy caches; do not claim offline task processing |

Transactions supply all-or-nothing grouping of database operations. Row security can restrict access to individual rows, but its documented bypass rules make it a layer of protection rather than a replacement for all application authorization. [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Explain the matching method simply

First filter candidates using eligibility rules. Then compute:

`score = 0.65 × urgencyFit + 0.25 × trust + 0.10 × capacity`

The production wiring selects this calibrated configuration. Here, urgency fit decreases as estimated pickup time increases relative to a 15-, 35-, or 60-minute target for express, normal, or low urgency. Estimated pickup time uses straight-line distance at an assumed 20 km/h plus eight minutes per active task. Capacity is `1 / (task load units + active load)`.

The standalone proximity weight is zero in this configuration, but distance still affects urgency fit. Workload affects both capacity and pickup estimates; an ablation should test whether both terms help. The weights express a design calibrated in the simulator; do not say research established these exact percentages as universal values.

### Explain Errand-Share precisely

Today requests can wait up to ten minutes for a partner; Whenever requests up to thirty minutes. ASAP and requests with a manually selected runner bypass sharing. Compatible requests belong to different buyers and must satisfy pickup separation, drop-off separation, detour, and deadline conditions.

The algorithm checks the six possible stop orders that preserve each pickup before its delivery. It chooses a feasible route and then the preferred currently available partner. This is **online greedy pairing with exact two-request route enumeration**. It does not find the globally best assignment across all present and future errands.

Initial limits include 1 km pickup separation, 2 km drop-off separation, and both a 20% proportional detour limit and a 2 km absolute limit. For direct trips shorter than 0.1 km the proportional test is skipped. These are versioned prototype choices to test, not established Accra standards.

## 5. Comparison and defensible uniqueness

Product pages were inspected on 11 September 2026. They establish advertised features, not verified service quality, deployment completeness, or proprietary algorithm details. An unmentioned capability is **not established from the reviewed material**, rather than proven absent.

| Comparator | What the reviewed source establishes | Implication for Mélange's pitch |
|---|---|---|
| [Yango Delivery Ghana](https://delivery.yango.com/gh-en?from=cityheader&lang=en) | Personal and business express-delivery offerings in Ghana | Delivery access and proximity-based convenience are not sufficient novelty claims |
| [Yango business delivery](https://delivery.yango.com/?lang=en) | Advertises algorithmic routing/dispatch and tracking | Do not claim competitors lack algorithms or that routing itself is new; no controlled performance comparison was conducted |
| [Taskrabbit](https://support.taskrabbit.com/hc/en-us/articles/46260422073755-How-Do-I-Hire-a-Tasker) | Users select workers using profiles, skills, rates, reviews, and availability | Useful international task-marketplace comparator; automatic multi-criteria assignment is a different workflow, not evidence of better outcomes |
| [Yendrop](https://www.yendrop.com/about) | Advertises Ghana-oriented food, grocery, parcel, market-item, medicine, and errand services with customer/rider/admin coordination | Broad errand coverage and Ghanaian localization already have comparators; this website alone does not verify operating scale |
| [TorMaMe](https://tormame.dev/) | Describes a Ghanaian peer-to-peer errand product with escrow and delivery confirmation; explicitly identifies an MVP/demo-to-pilot stage | A particularly close concept comparator; being Ghanaian, using runners, or demonstrating escrow cannot independently establish uniqueness |
| Informal coordination, to be studied locally | No interviews or observations collected in this review | Treat phone/WhatsApp/referral workflows as proposed field-study comparators; do not invent their failure rates or assume they lack trust |

**Recommended contribution statement:**

> Mélange contributes an implemented and evaluable combination of behavioural trust, explainable runner ranking, and deadline-aware two-errand consolidation in an Accra-oriented prototype, supported by auditable lifecycle records and reproducible baseline comparisons.

This is a proposed contribution in integration, contextual design, and evaluation. The review has not established a globally novel mathematical algorithm or that no competing product combines similar mechanisms. A defensible BSc pitch can explain what was built, why, and what was learned without claiming to be the first.

## 6. What the existing results actually support

### Matching: promising results within a synthetic model

The committed final report contains 5,000 scenarios, distinct calibration and final seeds, and paired bootstrap intervals. The values below are transcribed from that report, not freshly reproduced.

| Strategy | Simulated completion with pickup within target | NDCG@5 | Mean modeled pickup time |
|---|---:|---:|---:|
| Random eligible | 18.94% | 0.874 | 32.05 min |
| Nearest eligible | 23.40% | 0.931 | 26.00 min |
| Highest trust | 20.86% | 0.884 | 31.94 min |
| Equal weight | 26.86% | 0.965 | 24.94 min |
| Previous configuration | 26.04% | 0.953 | 25.54 min |
| Proposed configuration | **27.34%** | **0.967** | **24.78 min** |

Against nearest eligible, the difference is **3.94 percentage points**, with a reported paired 95% interval of **2.98 to 4.98 points**. Against equal weight, the improvement is only **0.48 points**, interval **0.08 to 0.84**. The latter is the more demanding comparator and should appear in the presentation. These intervals quantify uncertainty within the modeled scenarios, not uncertainty about deployment in Accra.

NDCG measures how closely the ranking follows the simulator's preferred ordering. A value of 0.967 is **not 96.7% delivery accuracy**. The reported zero eligibility violations apply to simulated candidate ranking, not a general security guarantee.

**Critical qualifications from source inspection:**

1. The report labels its main measure “successful on time,” but the oracle defines it as `completed && pickupMinutes <= target`. It does not model delivery finishing before a customer deadline. Use the more precise table label above.
2. The generator creates trust as a noisy proxy for hidden completion reliability. It does not generate the full event history and evaluate `computeTrust`. The matching report therefore does not validate the entire trust framework.
3. Every generated matching scenario has a forced eligible candidate. This experiment does not establish behaviour under real shortages of eligible runners.
4. Calibration and final evaluation change the seed but use the same generator family. This reduces direct reuse of calibration scenarios, while leaving model-assumption bias unresolved.
5. Reported 99.28% stability comes from individual ±10% weight perturbations. Multiplying the zero proximity weight leaves it zero, creating two unchanged variants; it is not broad robustness to alternative assumptions.
6. Simulation categories differ from some current interface category labels. A later validation should use production categories and real eligibility semantics.

### Sharing: geometric feasibility evidence

The committed 1,000-errand simulation reports 809 eligible errands, 800 paired errands, 400 pairs, and a **98.89% pairing rate among eligible errands**. Modeled total distance decreases from **4,317.308 km to 2,842.470 km**, a **34.16% reduction**, with zero accepted-route deadline or detour violations in that dataset.

The generator deliberately clusters pickups and delivery directions. Its very high pairing rate should not be forecast as an Accra-wide result. Distance uses straight-line geometry, includes direct travel for unpaired errands, and excludes runner approach/repositioning journeys. It does not measure road distance, fuel consumption, emissions, customer prices, or net runner earnings.

Cancellation and completion outcomes are generated from random draws with fixed assumptions; the reported 8.50% cancellation and 83.13% completion figures do not show that sharing caused either outcome. The experiment also does not establish that a suitable runner will be available for every feasible pair.

The matching and sharing experiments are separate. They do not yet show the combined pipeline's end-to-end performance.

## 7. Aim, objectives, and research questions

**Aim:** To design and evaluate an explainable errand marketplace that incorporates behavioural trust into runner selection and tests constrained request sharing in an Accra-oriented setting.

**Objectives:**

1. Investigate how intended buyers and runners currently arrange errands, what difficulties they experience, and what they require from a platform.
2. Specify and implement the task lifecycle and role-based information system with traceable decisions.
3. Evaluate trust-aware matching against nearest, highest-trust, random, and equal-weight baselines.
4. Evaluate the efficiency–waiting trade-off of two-errand sharing under explicit feasibility constraints.
5. Assess usability, explanation comprehension, and key failure paths, then document limitations and design lessons.

| Research question | Evaluation and evidence |
|---|---|
| RQ1: How does multi-criteria ranking compare with simpler strategies? | Paired synthetic/replay comparisons of pickup timeliness, completion, ranking quality, and eligibility violations |
| RQ2: Under what demand and travel assumptions does sharing reduce modeled travel without breaching service constraints? | Sharing versus solo execution across demand densities, arrival patterns, road/travel assumptions, and waiting limits |
| RQ3: Can intended users complete core tasks and understand the platform's decisions? | Observed task completion, time, errors, explanation questions, and qualitative interviews |

Keep RQ1 primary. RQ2 and RQ3 support the system contribution. A standalone research programme for fraud prediction or automated arbitration would substantially expand scope; these modules can instead receive scenario-based correctness and failure analysis.

## 8. Proposed research methodology

Use Design Science Research Methodology to connect problem investigation, solution objectives, design/development, demonstration, evaluation, and communication. Because a prototype already exists, describe the actual sequence honestly: investigate and refine its assumptions, then evaluate it. Do not imply earlier user studies occurred. [Peffers et al.](https://doi.org/10.2753/MIS0742-1222240302)

### A. Establish the local problem

Propose an initial purposive sample of approximately 8–12 potential buyers and 5–8 runners or small-business operators from one accessible study area. These are practical exploratory targets, not statistically representative sample sizes. Adjust with the supervisor, participant access, and the range of themes found.

Ask about a recent actual errand: how it was arranged, time and cost, runner choice, problems, dispute handling, acceptable waiting, willingness to share, and information participants would be comfortable providing. Separate actual behaviour from hypothetical willingness. Obtain the university's required ethics clearance and participant consent before collecting research data.

### B. Make algorithm evaluation stronger

- Preserve existing frozen reports as preliminary evidence. Version any revised generator, metric, or configuration and evaluate on newly reserved data/seeds.
- Vary trust quality, including weak or misleading trust signals; runner scarcity; stale/missing locations; load; travel speed; category availability; and newcomer histories.
- Perform ablations: remove trust, remove capacity, use unsmoothed history, and vary decay. This distinguishes helpful components from merely plausible ones.
- For sharing, test sparse and bursty arrivals, dispersed destinations, different wait windows, road distances if available, and runner approach travel.
- Compare with solo execution and a simple first-feasible-pair baseline. For small batches, an offline best-pairing reference can reveal the cost of greedy decisions, while acknowledging its knowledge of the complete batch.
- Separate request-to-offer, offer-to-acceptance, pickup time, and final completion time. Report coverage and denominators, including no-match and rejected offers.

The next study should evaluate both modules together, since a geometrically feasible pair may require a runner with a harder-to-find combination of capabilities.

### C. Conduct a bounded usability study

Propose approximately 12–20 participants spanning buyer and runner roles, with administrator scenarios reviewed by the supervisor or another suitable evaluator. This is formative evidence; any population-level effect claim requires a justified sample and analysis plan.

Tasks: post an errand, understand a runner recommendation, interpret a shared request and its waiting time, accept/decline an offer, submit delivery evidence, and find the dispute route. Measure independent completion, time, critical errors, and comprehension. If comparing explanation variants, counterbalance their order to reduce learning effects.

Use demo balances and synthetic identity/evidence records in demonstrations wherever real identifiers are unnecessary. Examine whether automatic pairing is sufficiently disclosed and acceptable to users; the current product pairs eligible requests automatically rather than asking them to choose a partner.

### D. Evaluate integrity and responsible operation

Check unauthorized access, duplicate acceptance, cancellation/refund races, no-candidate recovery, one-sided cancellation in a shared trip, and contradictory evidence. For fraud/disputes, use documented scenarios with explicit expected outcomes, record false flags and inappropriate automatic resolutions, and test escalation.

Include newcomer opportunity, reasons for exclusion, and runner feedback. Do not interpret the existing selection-concentration statistic as proof of fairness. Assess earnings or affordability only with appropriate cost and payment data; the current demo cannot establish either.

## 9. Two-minute supervisor pitch

> My final-year project is Mélange, an errand marketplace designed around the question of how to select a suitable runner and manage delivery reliably.
>
> Ghana already has delivery and errand platforms, so my contribution focuses on the decision process. The nearest runner may be overloaded or unreliable, while a highly rated runner may be too far away. Mélange combines behavioural trust, estimated pickup time, and workload in an explainable ranking. It also tests whether two compatible errands can share a route within waiting, detour, and deadline limits.
>
> The research foundation comes from studies of trust in crowdshipping, Bayesian reputation systems, and pickup-and-delivery routing. I have built the supporting buyer, runner, and administrator workflows, including verification, delivery evidence, dispute handling, and simulated settlement.
>
> Preliminary simulation results suggest the approach is worth evaluating further. On 5,000 synthetic matching scenarios, the proposed method achieved 27.34% simulated completion with pickup within the target time, compared with 23.40% for nearest-runner selection and 26.86% for equal weighting. These results describe the simulator, not live delivery performance.
>
> I propose to use design science research to investigate local requirements, strengthen the baseline and sensitivity experiments, and conduct usability testing with intended users. The expected contribution is an evaluated information system and evidence about when its matching and sharing decisions help, including the conditions under which they fail.

Evidence for the pitch's literature statements and numerical comparisons appears in sections 2, 3, and 6. The script is written in the student's voice for rehearsal, not as a record of research already conducted.

## 10. Questions to prepare for

**“Why build this when Yango or Taskrabbit exists?”** Their existence establishes a relevant category. My project evaluates a transparent decision method and constrained sharing in a bounded context; I am not claiming to replace their commercial operations or beat proprietary algorithms.

**“What exactly is new?”** The proposed contribution is the implemented combination and its evaluation. Bayesian reputation, weighted ranking, and route enumeration are established ideas. I will avoid a first-ever claim unless a much broader review supports it.

**“Why these weights and thresholds?”** The matching weights were selected in a calibration simulation. Other parameters are explicit prototype assumptions. Sensitivity tests and local evidence will assess them; a citation to a general method does not validate the exact constants.

**“Does your simulation validate the trust score?”** It validates ranking given synthetic trust inputs. I need a separate event-history experiment to evaluate the actual trust computation.

**“Why is the success figure only 27.34%?”** It is a joint simulated event involving acceptance, non-cancellation, completion, and meeting a pickup target. Its absolute value depends on the generator. It is not a measured customer delivery-success rate; comparisons and the metric definition must be shown together.

**“Have you saved 34% of delivery cost?”** No. The sharing simulation shows 34.16% less modeled geometric distance under clustered demand. Actual cost, road travel, and runner positioning require separate measurement.

**“Is this an AI project?”** Its implemented core uses deterministic scoring, rules, and heuristics with a Bayesian component. I would describe those techniques precisely rather than claiming a trained AI model or an LLM making delivery decisions.

**“Does verification guarantee a trustworthy runner?”** No. It is one access and evidence mechanism. Behavioural history, operational records, review, and appeals address different issues; each needs evaluation.

**“Does the wallet accept mobile money?”** No. Current balances are demo credits. Real payments and authoritative provider integration are future work.

**“What work remains if the application is already built?”** Local problem validation, stronger controlled comparisons, integrated evaluation, usability research, and analysis of limitations. Those activities turn the prototype into a defensible research project.

## 11. Suggested presentation structure

1. **Problem:** one concrete hypothetical errand illustrating trust, timing, and coordination; label the example hypothetical until interviews support it.
2. **Evidence and context:** trust research, Ghana digital context, and what remains unknown locally.
3. **Existing solutions:** Yango, Taskrabbit, Yendrop, and the TorMaMe prototype; identify overlap honestly.
4. **Proposed contribution:** explainable matching as the main contribution, sharing as the supporting experiment.
5. **System demonstration:** post → pair or release → match → accept → proof → demo settlement/dispute.
6. **Preliminary results:** nearest and equal-weight comparisons, with the corrected metric label and simulation qualification visible.
7. **Evaluation plan:** local interviews, sensitivity/ablation studies, integrated scenarios, and usability testing.
8. **Scope and supervision request:** agree the study area, primary question, evaluation expectations, and proposal format.

## 12. Source register and implementation evidence

### Research and contextual references

- Cebeci, M. S., Tapia, R. J., Kroesen, M., de Bok, M. A., & Tavasszy, L. (2023). *The effect of trust on the choice for crowdshipping services*. Transportation Research Part A, 170, 103622. [DOI](https://doi.org/10.1016/j.tra.2023.103622). [Accessible published paper](https://pure.tudelft.nl/ws/portalfiles/portal/148467913/1_s2.0_S0965856423000423_main.pdf).
- Jøsang, A., & Ismail, R. (2002). *The Beta Reputation System*. 15th Bled Electronic Commerce Conference. [Original paper](https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf).
- Dahle, L., Andersson, H., Christiansen, M., & Speranza, M. G. (2019). *The pickup and delivery problem with time windows and occasional drivers*. Computers & Operations Research, 109, 122–133. [DOI](https://doi.org/10.1016/j.cor.2019.04.023). Publisher abstract consulted; full-text access was unavailable through the browser.
- Rudin, C. (2019). *Stop explaining black box machine learning models for high stakes decisions and use interpretable models instead*. Nature Machine Intelligence, 1, 206–215. [Publisher](https://www.nature.com/articles/s42256-019-0048-x).
- Peffers, K., Tuunanen, T., Rothenberger, M. A., & Chatterjee, S. (2007). *A design science research methodology for information systems research*. Journal of Management Information Systems, 24(3), 45–77. [DOI](https://doi.org/10.2753/MIS0742-1222240302). [Paper](https://zhang.ist.psu.edu/teaching/504/readings/Peffers.pdf).
- Silva, M., Pedroso, J. P., Viana, A., & Klimentova, X. (2021). *A Branch-Price-And-Cut Algorithm for Stochastic Crowd Shipping Last-Mile Delivery with Correlated Marginals*. ATMOS, OASIcs 96, 12:1–12:20. [Publisher record and abstract](https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2021.12). Used as a bounded comparison of research approaches.
- Bank of Ghana. *Payment Systems Oversight Annual Report 2025*, section 5.1, printed page 26. [Report](https://www.bog.gov.gh/wp-content/uploads/2026/08/Payment-Systems-Annual-Report-2025-1.pdf). Reporting period 2025; accessed September 2026.
- Ghana Statistical Service (2023). *Release of the 2021 PHC Thematic Brief on Digital Exclusion in Ghana*. [Official release](https://census2021.statsghana.gov.gh/newspage.php?Release-of-the=&readmorenews=MjUwNzE4NDkzNS43Njc1).
- Fairwork (2022). *Fairwork Ghana Ratings 2022: Towards Better Policies in the Platform Economy*. [Report](https://fair.work/wp-content/uploads/sites/17/2022/11/221103_fairwork_ghana-report-2022_RZ.pdf).

Product and database documentation links are attached directly to the relevant comparisons and rationale above. They are primary descriptions of products or technical behaviour, not peer-reviewed evidence of efficacy. The review used targeted searches on trust, reputation, crowdshipping/routing, Ghana digital access and payments, platform work, and comparable services. It did not exhaust all publications or privately documented product features.

### Key repository evidence

- [Trust calculation](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/trust.ts:3>) and [matching configuration](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/matching.ts:32>).
- [Matching final report](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/reports/matching/final.md>) and [actual oracle outcome definition](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/matching-evaluation/oracle.ts:96>).
- [Matching generator](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/matching-evaluation/generator.ts:30>) and [stability calculation](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/matching-evaluation/metrics.ts:75>).
- [Sharing algorithm](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/errand-share.ts>), [sharing report](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/reports/errand-share/simulation.md>), and [sharing outcome assumptions](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/errand-share-evaluation/generator.ts:89>).
- [Fraud rules](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/fraud.ts>) and [arbitration rules](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/src/lib/algorithm/arbitration.ts>).
- [Current README and demo-money boundary](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/README.md>) and [current service worker](<C:/Users/Joel Ago/Desktop/melange-main/melange-main/public/sw.js>).

Some architecture prose is older than current behaviour: it mentions automatic simulated top-ups and cached application pages. The current README, demo-money implementation, and service worker take precedence for this brief. No claim of production readiness, a fresh security audit, or successful live testing is made.
