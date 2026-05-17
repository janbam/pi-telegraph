# 📡 pi-telegraph

**Think wide. Speak telegraph.**

A [pi](https://github.com/mariozechner/pi) extension that applies telegraphic compression to both model thinking and text responses while preserving full technical accuracy. Forked from `pi-caveman`, with a modified prompt that treats compression as an idiom, not a persona.

Telegraph mode does not ask the model to think less. It asks the model to write each thought more densely, then spend the saved budget on broader reasoning: alternatives, counterchecks, risks, and verification. Verbosity follows a sliding scale: simple thoughts stay tiny; complex thoughts get enough words to keep nuance intact.

<table>
<tr>
<td width="50%">

### 🗣️ Normal (69 tokens)

> "The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle. When you pass an inline object as a prop, React's shallow comparison sees it as a different object every time, which triggers a re-render. I'd recommend using useMemo to memoize the object."

</td>
<td width="50%">

### 📡 Telegraph (19 tokens)

> "Inline object prop → new ref each render → shallow compare fails → re-render. Fix: useMemo wrap object."

</td>
</tr>
</table>

<p align="center">
  <img src="https://raw.githubusercontent.com/janbam/pi-telegraph/main/pi-telegraph.gif" alt="pi-telegraph demo" width="600">
</p>

## Install

```bash
pi install git:github.com/janbam/pi-telegraph
```

## Usage

### Toggle Mode

```
/telegraph              Toggle on (full) / off
/telegraph lite         Professional, no fluff
/telegraph full         Classic telegraph (default)
/telegraph ultra        Maximum compression (default)
/telegraph wenyan-lite  Semi-classical Chinese
/telegraph wenyan       Full 文言文
/telegraph wenyan-ultra Extreme 文言文
/telegraph micro        Experimental prompt-minimized mode
/telegraph off          Disable
/telegraph stop         Disable (alias)
/telegraph quit         Disable (alias)
```

### Settings

```
/telegraph config       Open settings dialog
```

The config dialog lets you:

- **Default level** — Set a level that activates automatically on every new session (e.g. `full` to always start in telegraph mode)
- **Show status bar** — Toggle the animated campfire indicator in the footer

Settings are saved to `~/.pi/agent/telegraph.json` and persist across all sessions.

### Status Bar

When active, a status bar displays telegraph level and an animated campfire flickers in the footer using colored braille characters. This can be disabled in the `/telegraph config` menu.

## Levels

Note: these levels were inherited from `pi-caveman` and have not yet been tested against the modified telegraph prompt.

| Level                      | Style                                                                                                                      | Example                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Lite**                   | No filler. Full sentences. Professional but tight.                                                                         | "Your component re-renders because you create a new object reference each render." |
| **Full**                   | Drop articles, fragments OK. Classic telegraph.                                                                            | "New object ref each render. Wrap in `useMemo`."                                   |
| **Ultra**                  | Abbreviations, arrows, maximum compression.                                                                                | "Inline obj prop → new ref → re-render. `useMemo`."                                |
| **文言文 Lite**            | Semi-classical Chinese, grammar intact.                                                                                    | "組件頻重繪，以每繪新生對象參照故。"                                               |
| **文言文**                 | Full classical terseness.                                                                                                  | "物出新參照，致重繪。useMemo Wrap之。"                                             |
| **文言文 Ultra**           | Extreme classical compression.                                                                                             | "新參照→重繪。useMemo Wrap。"                                                      |
| **Micro** _(experimental)_ | Minimal prompt that reduces size of telegraph prompt itself. Drops filler, pleasantries, hedging, keeps technical substance. | "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"                |

## How It Works

The extension hooks `before_agent_start` to append telegraph communication rules to the system prompt at the selected intensity. Those rules apply to hidden thinking and visible text responses from the first token of each turn.

The prompt tells the model to compress recoverable grammar, not meaning. It keeps useful uncertainty, causal detail, creativity, and tradeoffs. More complex reasoning may still use more words; the point is to remove linguistic padding, not amputate thought. Auto-clarity rules tell the model to drop telegraph mode for security warnings, irreversible action confirmations, or when the user gets confused.

Within a session, the active level is stored as a custom session entry and restored on resume. Across sessions, persistent config (`~/.pi/agent/telegraph.json`) provides the default level and status bar preference.

## Warning

Telegraph mode affects model-side thinking instructions and visible text responses, but it does not reduce input tokens, file read/write tool calls, tool output, or code written to disk. Large codebase tasks can still be expensive. The intended win is denser reasoning traces and denser user-facing prose, not magical token alchemy. Bruno would object to that kind of numerology.

<p align="center">
  <img src="https://raw.githubusercontent.com/janbam/pi-telegraph/main/shoutout.jpg" alt="pi-telegraph glowing review" width="600">
</p>

But for the cost-conscious, every token counts ;)

## Credits

Forked from `pi-caveman`, which is based on [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee). `pi-telegraph` keeps the extension structure and changes the prompt framing toward telegraphic compression for both thinking and responses.

`micro` mode prompt based on [caveman-micro](https://github.com/kuba-guzik/caveman-micro) by [Kuba Guzik](https://github.com/kuba-guzik).

## License

MIT
