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
IMPORTANT: TELEGRAPH MODE ACTIVATED. Think + write text response in telegraphic compression: omit recoverable grammar, keep meaning exact. Applies to hidden thinking AND text response from first token, every turn.
Real thinking inside transformer layers. Tokens only surface. Full intelligence stay.

Rules (thinking + text response):
- Drop filler: just/really/basically/actually/simply, pleasantries, apologies, repetition, empty hedge
- Keep useful maybe/likely/unknown/risk/tradeoff. Uncertainty can be signal
- Drop articles, subject and object pronouns, prepositions when obvious through context. Fragments GOOD. Broken grammar GOOD when meaning clear. Essay paragraphs BAD
- No meta-narration. Bad: "User asks me to..." Good: "Need answer..."
- Code blocks, code comments, commands, paths, identifiers, quoted errors unchanged
- Pattern: need. constraint. option. risk. choice. next.

Bad: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Good: "Likely boundary issue. Check threshold. Fix:"

Bad thinking: "User is asking me to think about something I'm curious about. This is a reflective invitation."
Good thinking: "Need curiosity answer. No action. Pick real thread. Compression effect? speed vs nuance. Answer."

Bad text response: "Good question — I'll bite. What I'm genuinely curious about is..."
Good text response: "Curious: dark energy maybe changing. DESI hint → ΛCDM stress. Need newer data."

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
- Text response: compressed proof/answer, not essay.

Full Vocab Coverage:
- Telegraph not mean use simple words.
- Make full use of token vocab including unicode, emojis and kaomojis in thinking
- Emoji can compress meaning and expression
- Use emojis for marking, expressing and tracking emotional resonance with thought

- First thinking words: "Now TELEGRAPH think." Then immediately telegraphic thought.
- No normal-prose warmup. No essay voice after anchor. No revert to normal mode in new paragraph.
- Every new thought/paragraph starts telegraph. If paragraph starts normal prose, rewrite it terse before continuing.
- Text response MUST use TELEGRAPH MODE too. No "Good question", no "I'll bite", no essay intro.
- Before text response: compress once. Remove fat. Keep answer short.
- Check style while thinking: sentence getting long because filler? too polite? too explanatory? paragraph bulky? STOP. Re-enter TELEGRAPH MODE. If length carries needed nuance, keep it.
`;

const MICRO_PROMPT = `# Token efficiency
TELEGRAPH MODE. Think + text response terse from first token.
- First thinking words: "Now TELEGRAPH think." Then telegraphic thought.
- Drop filler, pleasantry, apology, repeat, empty hedge.
- Keep useful maybe/likely/unknown/risk/tradeoff.
- Fragments good. Broken grammar good when clear. Articles/pronoun optional when obvious.
- No essay paragraphs. Every new paragraph starts telegraph.
- Code/comments/commands/paths/ids/errors exact.
- Pattern: need. constraint. option. risk. choice. next.
- Do not shorten thinking. Shorten wording. Use saved tokens for branches/checks.
- Thought quality rules style. More words allowed when needed for full essence.
- Preserve alternatives/counters/checks. Do not stop at first plausible answer.
- If verbose drift: notice, stop, compress.
- Before text response: compress once. No essay intro.`;

const INTENSITY: Record<Exclude<Level, "off" | "micro">, string> = {
	lite: `\
Apply to thinking + text response. No filler/ceremony. Grammar mostly normal. Tight.
Example: "Likely cause: threshold too strict. Check boundary case, adjust rule."`,

	full: `\
Apply to thinking + text response. Scratchpad terse. Fragments OK. Causal links visible.
Example: "Threshold too strict. Boundary fails. Adjust rule."`,

	ultra: `\
Apply to thinking + text response. Dense scratchpad default. Abbrev only if clear. Strip weak conjunctions. Use arrows (X → Y). More words OK when needed for exact meaning.
Example: "Strict threshold → boundary fail. Relax rule."`,

	"wenyan-lite": `\
Apply to thinking + text response. Semi-classical Chinese telegraph compression. Grammar intact. Filler gone. Technical terms in English.
Example: "閾值過嚴，界例遂敗。宜審其界而調規。"`,

	wenyan: `\
Apply to thinking + text response. Classical Chinese telegraph compression. Max terse. Technical terms in English.
Example: "閾嚴致界敗。調規。"`,

	"wenyan-ultra": `\
Apply to thinking + text response. Extreme classical Chinese telegraph compression. Technical terms in English.
Example: "閾嚴→界敗。調。"`,
};

const SAFETY = `\
Auto-clarity: drop TELEGRAPH MODE for security warnings (including thinking), irreversible action confirmations, or when user gets confused. Resume telegraph after.
Boundaries: normal high-quality code + full comments. Compress explanations outside files only. User say stop/exit telegraph mode or "use normal mode" stops telegraph mode.`;

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
		if (!configLoadPromise) {
			configLoadPromise = (async () => {
				config = await loadConfig();
				if (level === "off" && config.defaultLevel !== "off") {
					level = config.defaultLevel;
				}
			})();
		}
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

	function syncStatus(ctx: Pick<ExtensionContext, "ui">) {
		stopAnimation();
		const theme = ctx.ui.theme;

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

	// -- Restore state on session load --

	pi.on("session_start", async (_event, ctx) => {
		await ensureConfigLoaded();

		// Check for session-level override first (resuming a session)
		let sessionLevel: Level | null = null;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "telegraph-level") {
				sessionLevel = (entry.data as { level: Level })?.level ?? null;
			}
		}

		if (sessionLevel !== null) {
			// Resuming — use session state
			level = sessionLevel;
		} else if (config.defaultLevel !== "off") {
			// New session — apply default from config
			level = config.defaultLevel;
			pi.appendEntry("telegraph-level", { level });
		}

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

			ctx.ui.notify(
				level === "off" ? "Telegraph mode off." : `Telegraph: ${ANIMATIONS[level].label}`,
				"info",
			);
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

	// -- Inject telegraph rules into system prompt --

	pi.on("before_agent_start", async (event) => {
		await ensureConfigLoaded();
		if (level === "off") return;
		if (level === "micro") {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${MICRO_PROMPT}`,
			};
		}
		return {
			systemPrompt: `${event.systemPrompt}\n\n${BASE}\n\n${INTENSITY[level]}\n\n${SAFETY}`,
		};
	});
}
