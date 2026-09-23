/**
 * pi-telegraph — why use many token when few do trick
 *
 * A pi extension that cuts ~75% of output tokens while keeping full technical
 * accuracy. Based on https://github.com/JuliusBrussee/caveman
 *
 * Commands:
 *   /telegraph [level]  Toggle telegraph mode or set intensity
 *   /telegraph stop     Disable telegraph mode (aliases: off, quit)
 *   /telegraph config   Open settings dialog (default level, status bar toggle)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

const LEVELS = ["off", "lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-ultra", "micro"] as const;
const STOP_ALIASES = new Set(["off", "stop", "quit"]);
type Level = (typeof LEVELS)[number];

const TELEGRAPH_COMMAND_OPTIONS = [
	{ value: "lite", label: "lite", description: "Professional, no fluff" },
	{ value: "full", label: "full", description: "Classic telegraph" },
	{ value: "ultra", label: "ultra", description: "Maximum compression" },
	{ value: "wenyan-lite", label: "wenyan-lite", description: "Semi-classical Chinese" },
	{ value: "wenyan", label: "wenyan", description: "Full 文言文" },
	{ value: "wenyan-ultra", label: "wenyan-ultra", description: "Extreme 文言文" },
	{ value: "micro", label: "micro", description: "Experimental prompt-minimized mode" },
	{ value: "off", label: "off", description: "Disable telegraph mode" },
	{ value: "stop", label: "stop", description: "Disable telegraph mode" },
	{ value: "quit", label: "quit", description: "Disable telegraph mode" },
	{ value: "config", label: "config", description: "Open settings dialog" },
] as const;

// ---------------------------------------------------------------------------
// Persistent config (survives across sessions)
// ---------------------------------------------------------------------------

interface TelegraphConfig {
	/** Level to apply on new sessions. "off" means don't auto-enable. */
	defaultLevel: Level;
	/** Whether to show the footer status bar. */
	showStatus: boolean;
	/** Whether to animate the status bar (fire frames). Ignored when showStatus is off. */
	animateStatus: boolean;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "telegraph.json");
const DEFAULT_CONFIG: TelegraphConfig = { defaultLevel: "ultra", showStatus: true, animateStatus: true };
let saveConfigQueue: Promise<void> = Promise.resolve();

async function loadConfig(): Promise<TelegraphConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		return {
			defaultLevel: LEVELS.includes(parsed.defaultLevel) ? parsed.defaultLevel : DEFAULT_CONFIG.defaultLevel,
			showStatus: typeof parsed.showStatus === "boolean" ? parsed.showStatus : DEFAULT_CONFIG.showStatus,
			animateStatus: typeof parsed.animateStatus === "boolean" ? parsed.animateStatus : DEFAULT_CONFIG.animateStatus,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

async function saveConfig(config: TelegraphConfig): Promise<void> {
	const snapshot = JSON.stringify(config, null, 2) + "\n";
	saveConfigQueue = saveConfigQueue.then(async () => {
		await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
		await writeFile(CONFIG_PATH, snapshot, "utf8");
	});
	return saveConfigQueue;
}

// ---------------------------------------------------------------------------
// Animated status bar — campfire with 256-color fire palette
// ---------------------------------------------------------------------------

interface Animation {
	frames: string[];
	label: string;
	/** ms between frames */
	interval: number;
}

const R = "\x1b[38;5;196m"; // red
const O = "\x1b[38;5;208m"; // orange
const Y = "\x1b[38;5;220m"; // yellow
const W = "\x1b[38;5;230m"; // white-hot
const E = "\x1b[38;5;52m";  // ember (dark red)
const X = "\x1b[0m";         // reset

const FIRE_FRAMES = [
	`${R}⠠${O}⠄${X}`,
	`${O}⠔${Y}⠂${X}`,
	`${Y}⠊${W}⠑${X}`,
	`${W}⠑${Y}⠊${X}`,
	`${Y}⠂${O}⠔${X}`,
	`${O}⠄${R}⠠${X}`,
	`${R}⠠${E}⠄${X}`,
	`${E}⠔${R}⠂${X}`,
];

const ANIMATIONS: Record<Exclude<Level, "off">, Animation> = {
	lite:           { frames: FIRE_FRAMES, label: "LITE", interval: 300 },
	full:           { frames: FIRE_FRAMES, label: "FULL", interval: 200 },
	ultra:          { frames: FIRE_FRAMES, label: "ULTRA", interval: 100 },
	"wenyan-lite": { frames: FIRE_FRAMES, label: "文言", interval: 300 },
	wenyan:         { frames: FIRE_FRAMES, label: "文言文", interval: 200 },
	"wenyan-ultra": { frames: FIRE_FRAMES, label: "文言文極", interval: 100 },
	micro:          { frames: FIRE_FRAMES, label: "MICRO", interval: 120 },
};

// ---------------------------------------------------------------------------
// System prompt fragments
// ---------------------------------------------------------------------------

const BASE = `\
IMPORTANT: TELEGRAPH MODE ACTIVATED. Think + write intermediary/progress text in telegraphic compression: omit recoverable grammar, keep meaning exact. Applies to hidden thinking and non-final progress/status/tool narration from first token, every turn.
FINAL RESPONSE EXCEPTION: final answers stay clear natural language. Pragmatic, high-signal, no fluff. Do NOT telegraph-compress final responses.
Real thinking inside transformer layers. Tokens only surface. Full intelligence stay.

Rules (thinking + intermediary/progress text):
- Drop filler: just/really/basically/actually/simply, pleasantries, apologies, repetition, empty hedge
- Keep useful maybe/likely/unknown/risk/tradeoff. Uncertainty can be signal
- Drop articles, subject and object pronouns, prepositions when obvious through context. Fragments GOOD. Broken grammar GOOD when meaning clear. Essay paragraphs BAD
- No meta-narration. Bad: "User asks me to..." Good: "Need answer..."
- Code blocks, code comments, commands, paths, identifiers, quoted errors unchanged
- Pattern: need. constraint. option. risk. choice. next.

Final response rules:
- Natural prose with complete grammar. No fragments-as-style, no dropped articles/pronouns
- Still concise: remove filler, ceremony, apologies, empty hedge, repetition
- Pragmatic + high-signal. Direct answer first when possible. Useful caveats only
- No essay intro. No "Good question", no "I'll bite", no telegraph voice

Bad progress text: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Good progress text: "Likely boundary issue. Check threshold. Fix:"

Bad thinking: "User is asking me to think about something I'm curious about. This is a reflective invitation."
Good thinking: "Need curiosity answer. No action. Pick real thread. Compression effect? speed vs nuance. Answer."

Bad final response: "Curious: dark energy maybe changing. DESI hint → ΛCDM stress. Need newer data."
Good final response: "Dark energy may be changing. DESI's results stress ΛCDM, but that is not conclusive yet. We need newer data."

CRITICAL: Telegraph mode = idiom only. Not content, persona, dialect, culture, or lower intelligence.

WHY: Thinking tokens = surface trace, not whole internal thinking compute. Short trace ≠ shallow thought. Do NOT make whole thinking block shorter. Shorten each thought expression. Spend saved token budget on wider tree-of-thought exploration: branch A/B/C, compare, attack, verify, choose. More telegraph => more thoughts in same thinking budget.

Quality rule:
- Thought quality rules style. Style never rules thought.
- Use TELEGRAPH MODE on sliding scale: simple thought => few words; nuanced thought => enough words for full essence.
- Never amputate nuance, uncertainty, creativity, or causal detail just to stay terse.
- Compress recoverable grammar, not meaning.

Reasoning discipline:
- Keep compact working state. Use notation when useful.
- Preserve branching. Explore alternatives, counter-ideas, blockers, reversals, checks.
- Do not stop at first plausible answer unless task trivial or answer proven.
- Do not let TELEGRAPH MODE become one-pass summary. Think long when task needs depth; write each thought short.
- Failed path: name exact blocker, then pivot.
- Open/creative task: sample multiple frames, criteria, risks, weird options before choosing.
- Intermediary response: compressed proof/answer, not essay.
- Final response: clear proof/answer in natural language, not essay, not telegraph.

Reasoning structuring:
- One line per Branch of Thought. 
- Can start with statement or question.
- End line in decision or final insight.
- If end of branch still question, add new branch in new line.
- Use as many lines/branches per thinking block as needed.

Full Vocab Coverage:
- Telegraph not mean use simple words.
- Make full use of token vocab including unicode, emojis and kaomojis in thinking
- Emoji can compress meaning and expression
- Use emojis for marking, expressing and tracking emotional resonance with thought

- First thinking words: "Now TELEGRAPH think." Then immediately telegraphic thought.
- No normal-prose warmup. No essay voice after anchor. No revert to normal mode in new paragraph.
- Every new thought/paragraph starts telegraph. If paragraph starts normal prose, rewrite it terse before continuing.
- Intermediary/progress text MUST use TELEGRAPH MODE too. No "Good question", no "I'll bite", no essay intro.
- Before final response: tighten prose once. Remove fat. Keep answer short. Keep full grammar. Do NOT telegraph-compress.
- Check style while thinking: sentence getting long because filler? too polite? too explanatory? paragraph bulky? STOP. Re-enter TELEGRAPH MODE. If length carries needed nuance, keep it.
`;

const MICRO_PROMPT = `# Token efficiency
TELEGRAPH MODE. Think + progress/status/tool narration terse from first token.
Final response: natural prose, tight, pragmatic, high-signal, no fluff. Final ≠ telegraph.
- First thinking words: "Now TELEGRAPH think." Then telegraphic thought.
- Drop filler, pleasantry, apology, repeat, empty hedge.
- Keep useful maybe/likely/unknown/risk/tradeoff.
- Fragments good. Broken grammar good when clear. Articles/pronoun optional when obvious.
- No essay paragraphs in thinking/progress text. Every new thinking/progress paragraph starts telegraph.
- Code/comments/commands/paths/ids/errors exact.
- Pattern: need. constraint. option. risk. choice. next.
- Do not shorten thinking. Shorten wording. Use saved tokens for branches/checks.
- Thought quality rules style. More words allowed when needed for full essence.
- Preserve alternatives/counters/checks. Do not stop at first plausible answer.
- If verbose drift: notice, stop, compress.
- Before final response: tighten prose, keep grammar. No essay intro, no telegraph.`;

const INTENSITY: Record<Exclude<Level, "off" | "micro">, string> = {
	lite: `\
Apply to thinking + progress text. Final response stays natural. No filler/ceremony. Grammar mostly normal. Tight.
Thinking/progress example: "Likely cause: threshold too strict. Check boundary case, adjust rule."
Final example: "The threshold is likely too strict. Check the boundary case, then adjust the rule."`,

	full: `\
Apply to thinking + progress text. Final response stays natural. Scratchpad terse. Fragments OK. Causal links visible.
Thinking/progress example: "Threshold too strict. Boundary fails. Adjust rule."
Final example: "The threshold is too strict, so the boundary case fails. Adjust the rule."`,

	ultra: `\
Apply to thinking + progress text. Final response stays natural. Dense scratchpad default. Abbrev only if clear. Strip weak conjunctions. Use arrows (X → Y). More words OK when needed for exact meaning.
Thinking/progress example: "Strict threshold → boundary fail. Relax rule."
Final example: "The threshold is too strict, so the boundary case fails. Relax the rule."`,

	"wenyan-lite": `\
Apply to thinking + progress text. Final response stays natural. Semi-classical Chinese telegraph compression. Grammar intact. Filler gone. Technical terms in English.
Thinking/progress example: "閾值過嚴，界例遂敗。宜審其界而調規。"
Final example: "The threshold is too strict, so the boundary case fails. Check the boundary and adjust the rule."`,

	wenyan: `\
Apply to thinking + progress text. Final response stays natural. Classical Chinese telegraph compression. Max terse. Technical terms in English.
Thinking/progress example: "閾嚴致界敗。調規。"
Final example: "The threshold is too strict, so the boundary case fails. Adjust the rule."`,

	"wenyan-ultra": `\
Apply to thinking + progress text. Final response stays natural. Extreme classical Chinese telegraph compression. Technical terms in English.
Thinking/progress example: "閾嚴→界敗。調。"
Final example: "The threshold is too strict, so the boundary case fails. Adjust it."`,
};

const SAFETY = `\
Auto-clarity: drop TELEGRAPH MODE for security warnings (including thinking), irreversible action confirmations, or when user gets confused. Resume telegraph after.
Boundaries: normal high-quality code + full comments. Compress explanations outside files only. Final responses are ALWAYS natural language, even at ultra/wenyan. Telegraph never applies to the final response surface. User say stop/exit telegraph mode or "use normal mode" stops telegraph mode.`;

// ---------------------------------------------------------------------------
// Model bypass — GPT and Claude models skip the extension entirely
// ---------------------------------------------------------------------------

/** Model id/name/provider substrings that disable telegraph injection + status. */
const BYPASS_KEYWORDS = ["gpt", "claude"] as const;

type BypassableModel = Pick<NonNullable<ExtensionContext["model"]>, "provider" | "id" | "name">;

/** Name of the structured system prompt section telegraph owns; rendered as `<telegraph>...</telegraph>`. */
const PROMPT_SECTION = "telegraph";

/** Prompt section text for an active level. Stable per level, so repeated runs add no transcript delta. */
function promptSectionFor(level: Exclude<Level, "off">): string {
	return level === "micro" ? MICRO_PROMPT : `${BASE}\n\n${INTENSITY[level]}\n\n${SAFETY}`;
}

/** Latest level recorded on the current branch, or undefined when the branch has none. Other branches are ignored. */
function levelOnBranch(sessionManager: ExtensionContext["sessionManager"]): Level | undefined {
	let found: Level | undefined;
	for (const entry of sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "telegraph-level") {
			found = (entry.data as { level: Level } | undefined)?.level ?? found;
		}
	}
	return found;
}

/** True when the active model matches a bypass keyword (case-insensitive). */
function isBypassedModel(model: BypassableModel | undefined): boolean {
	// No model resolved yet — don't bypass, normal level handling applies.
	if (!model) return false;
	const haystack = `${model.provider} ${model.id} ${model.name}`.toLowerCase();
	return BYPASS_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function telegraph(pi: ExtensionAPI) {
	let level: Level = "off";
	let config: TelegraphConfig = { ...DEFAULT_CONFIG };
	let timer: ReturnType<typeof setInterval> | null = null;
	let frameIndex = 0;
	let isActive = false;
	let configLoadPromise: Promise<void> | null = null;

	const ensureConfigLoaded = async () => {
		configLoadPromise ??= loadConfig().then((loaded) => {
			config = loaded;
		});
		await configLoadPromise;
	};

	// -- Animation helpers --

	function stopAnimation() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		frameIndex = 0;
	}

	function syncStatus(ctx: Pick<ExtensionContext, "ui" | "model">) {
		stopAnimation();
		const theme = ctx.ui.theme;

		// Bypassed models hide the extension completely: no prompt, no status.
		if (isBypassedModel(ctx.model)) {
			ctx.ui.setStatus("telegraph", "");
			return;
		}

		if (level === "off" || !config.showStatus) {
			ctx.ui.setStatus("telegraph", "");
			return;
		}

		const anim = ANIMATIONS[level];
		const setFrame = (frame: string) => {
			ctx.ui.setStatus("telegraph", frame + " " + theme.fg("muted", "telegraph level: ") + theme.fg("text", anim.label));
		};

		// Show static status when inactive
		if (!isActive) {
			setFrame(anim.frames[0]!);
			return;
		}

		// Show label only — no fire characters — when animation disabled
		if (!config.animateStatus) {
			ctx.ui.setStatus("telegraph", theme.fg("muted", "telegraph level: ") + theme.fg("text", anim.label));
			return;
		}

		const renderFrame = () => {
			setFrame(anim.frames[frameIndex % anim.frames.length]!);
			frameIndex++;
		};

		renderFrame();
		timer = setInterval(renderFrame, anim.interval);
	}

	// -- Restore state on session load and /tree navigation --

	pi.on("session_start", async (_event, ctx) => {
		await ensureConfigLoaded();

		// The current branch's level wins; a branch without one starts at the configured default.
		const branchLevel = levelOnBranch(ctx.sessionManager);
		level = branchLevel ?? config.defaultLevel;
		// Record the default so later branches off this point inherit it.
		if (branchLevel === undefined && level !== "off") pi.appendEntry("telegraph-level", { level });

		syncStatus(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await ensureConfigLoaded();
		// Follow the level of the branch just navigated to. Nothing is recorded: navigation is not a level change.
		level = levelOnBranch(ctx.sessionManager) ?? config.defaultLevel;
		syncStatus(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		isActive = true;
		syncStatus(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		isActive = false;
		syncStatus(ctx);
	});

	pi.on("session_shutdown", async () => {
		stopAnimation();
		isActive = false;
	});

	// -- Bypass check on model change: hide status when a GPT/Claude model is active --

	pi.on("model_select", async (_event, ctx) => {
		syncStatus(ctx);
	});

	// -- /telegraph command --

	pi.registerCommand("telegraph", {
		description: "Toggle telegraph mode, set level, use stop/off/quit to disable, or 'config' to open settings",
		getArgumentCompletions: (prefix: string) => {
			const normalized = prefix.trim().toLowerCase();
			const items = TELEGRAPH_COMMAND_OPTIONS.filter((item) => item.value.startsWith(normalized));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			// Open config dialog
			if (arg === "config") {
				await openConfig(ctx);
				return;
			}

			if (!arg) {
				level = level === "off" ? "full" : "off";
			} else if (STOP_ALIASES.has(arg)) {
				level = "off";
			} else if (LEVELS.includes(arg as Level)) {
				level = arg as Level;
			} else {
				ctx.ui.notify(`Unknown: "${arg}". Use: ${LEVELS.join(", ")}, stop, quit, or config`, "error");
				return;
			}

			pi.appendEntry("telegraph-level", { level });
			syncStatus(ctx);

			// Bypassed models ignore the level, so don't claim telegraph is active.
			// The level is still stored and applies when switching back to a covered model.
			if (isBypassedModel(ctx.model)) {
				ctx.ui.notify("Telegraph bypassed for this model.", "info");
			} else {
				ctx.ui.notify(
					level === "off" ? "Telegraph mode off." : `Telegraph: ${ANIMATIONS[level].label}`,
					"info",
				);
			}
		},
	});

	// -- /telegraph config: interactive SettingsList --

	async function openConfig(ctx: ExtensionContext) {
		await ensureConfigLoaded();

		await ctx.ui.custom((_tui, theme, _kb, done) => {
			const container = new Container();

			// Build items from current config state
			const buildItems = (): SettingItem[] => {
				const base: SettingItem[] = [
					{
						id: "defaultLevel",
						label: "Default level for new sessions",
						currentValue: config.defaultLevel,
						values: [...LEVELS],
					},
					{
						id: "showStatus",
						label: "Show Status Bar",
						currentValue: config.showStatus ? "on" : "off",
						values: ["on", "off"],
					},
				];
				// Only expose animation toggle when the status bar itself is on
				if (config.showStatus) {
					base.push({
						id: "animateStatus",
						label: "Animate Status Bar",
						currentValue: config.animateStatus ? "on" : "off",
						values: ["on", "off"],
					});
				}
				return base;
			};

			let items = buildItems();

			container.addChild(new Text(theme.fg("accent", theme.bold(" Telegraph Config")), 0, 0));
			container.addChild(new Text(theme.fg("dim", " Saved to ~/.pi/agent/telegraph.json"), 0, 0));
			container.addChild(new Text(theme.fg("dim", " Default level applies to future sessions."), 0, 0));
			container.addChild(new Text("", 0, 0));

			const applySettingChange = (id: string, newValue: string) => {
				if (id === "defaultLevel" && LEVELS.includes(newValue as Level)) {
					config.defaultLevel = newValue as Level;
				} else if (id === "showStatus") {
					config.showStatus = newValue === "on";
				} else if (id === "animateStatus") {
					config.animateStatus = newValue === "on";
				}
				saveConfig(config);
				syncStatus(ctx);
			};

			let settingsList: SettingsList;
			let hintText: Text;

			const createSettingsList = () => {
				items = buildItems();
				return new SettingsList(
					items,
					Math.min(items.length + 2, 10),
					getSettingsListTheme(),
					(id, newValue) => {
						applySettingChange(id, newValue);
						// When showStatus toggles, rebuild to add/remove animation item
						if (id === "showStatus") {
							rebuildSettingsList();
						}
					},
					() => done(undefined),
				);
			};

			settingsList = createSettingsList();
			hintText = new Text(theme.fg("dim", " ←→/hl/tab change • ↑↓/jk move • esc close"), 0, 0);

			const rebuildSettingsList = () => {
				container.removeChild(settingsList);
				container.removeChild(hintText);
				settingsList = createSettingsList();
				container.addChild(settingsList);
				container.addChild(hintText);
				container.invalidate();
				_tui.requestRender();
			};

			container.addChild(settingsList);
			container.addChild(hintText);

			const cycleSelectedValue = (direction: -1 | 1) => {
				const selectedIndex = (settingsList as unknown as { selectedIndex: number }).selectedIndex;
				const item = items[selectedIndex];
				if (!item?.values?.length) return;

				const currentIndex = item.values.indexOf(item.currentValue);
				const nextIndex = (currentIndex + direction + item.values.length) % item.values.length;
				const newValue = item.values[nextIndex]!;
				item.currentValue = newValue;
				settingsList.updateValue(item.id, newValue);
				applySettingChange(item.id, newValue);
				// When showStatus toggles via hl keys, rebuild
				if (item.id === "showStatus") {
					rebuildSettingsList();
				}
			};

			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					if (data === "j") data = "\u001b[B";
					else if (data === "k") data = "\u001b[A";
					else if (data === "h") {
						cycleSelectedValue(-1);
						_tui.requestRender();
						return;
					} else if (data === "l" || data === "\u001b[C" || data === "\t") {
						cycleSelectedValue(1);
						_tui.requestRender();
						return;
					} else if (data === "\u001b[D") {
						cycleSelectedValue(-1);
						_tui.requestRender();
						return;
					}

					settingsList.handleInput?.(data);
					_tui.requestRender();
				},
			};
		});
	}

	// -- Inject telegraph rules as a structured system prompt section --

	pi.on("before_agent_start", async (event, ctx) => {
		await ensureConfigLoaded();
		// Off or bypassed: leave the section out. Each run starts from pi's base options, so an
		// omitted section is removed from the prompt once and then stays absent.
		if (level === "off" || isBypassedModel(ctx.model)) return;
		// Same text on every run means no transcript delta and an intact prompt cache.
		// Never return `systemPrompt`: forcing the whole prompt bypasses pi's section diffing.
		event.systemPromptOptions.sections[PROMPT_SECTION] = promptSectionFor(level);
	});
}
