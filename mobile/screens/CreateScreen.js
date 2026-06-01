import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, ActivityIndicator, Alert,
} from "react-native";
import Slider from "@react-native-community/slider";
import Dropdown from "../components/Dropdown";
import { api } from "../lib/api";
import { languageLabel } from "../lib/labels";
import { colors, space, radius, typography } from "../lib/theme";

export default function CreateScreen({ onCreated }) {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [writeLyrics, setWriteLyrics] = useState(false);
  const [theme, setTheme] = useState("");
  const [draftLyrics, setDraftLyrics] = useState(""); // AI-written lyrics, previewed + editable
  const [writing, setWriting] = useState(false);
  const [duration, setDuration] = useState(60);
  const [language, setLanguage] = useState("en");
  const [quality, setQuality] = useState("V0");
  const [randomSeed, setRandomSeed] = useState(true);
  const [seed, setSeed] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState(""); // "" = use model default
  const [timeSig, setTimeSig] = useState(""); // "" = use model default
  // Sampling fidelity + vocal-pronunciation knobs (Advanced). Sliders use
  // local numeric state; we only send the value when the user has touched it
  // (touched flag), otherwise the server falls back to its template default.
  const [steps, setSteps] = useState(30);
  const [stepsTouched, setStepsTouched] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [tempTouched, setTempTouched] = useState(false);
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState([]); // available trained voices (empty = feature off)
  const [cloneOn, setCloneOn] = useState(false);
  const [voice, setVoice] = useState("");

  // Load the picker option lists from the backend (single source of truth).
  useEffect(() => {
    api.options().then((r) => {
      setOpts(r.options);
      // Seed the Advanced sliders with whatever the server template currently
      // uses, so changing the JSON doesn't leave the UI showing a stale value.
      const d = r.options?.defaults;
      if (d?.steps != null && !stepsTouched) setSteps(d.steps);
      if (d?.temperature != null && !tempTouched) setTemperature(d.temperature);
    }).catch(() => {});
    api.voices().then((r) => { if (r.enabled) setVoices(r.voices); }).catch(() => {});
  }, []);

  async function writeLyricsNow() {
    if (!theme.trim()) return Alert.alert("Add a theme", "Type what the song should be about first.");
    setWriting(true);
    try {
      const { lyrics } = await api.writeLyrics(theme, language);
      setDraftLyrics(lyrics);
    } catch (e) {
      Alert.alert("Couldn't write lyrics", e.message);
    } finally {
      setWriting(false);
    }
  }

  async function submit() {
    const aiLyricsReady = writeLyrics && draftLyrics.trim();
    if (!style && !lyrics && !aiLyricsReady && !(writeLyrics && theme))
      return Alert.alert("Add some input", "Enter a style, some lyrics, or a theme for AI lyrics.");
    setBusy(true);
    try {
      const params = { title, style, duration: Math.round(duration), language, quality };
      if (writeLyrics) {
        params.writeLyrics = true;
        params.theme = theme;
        // Send the previewed/edited lyrics so the song matches what you saw.
        if (draftLyrics.trim()) params.lyrics = draftLyrics;
      } else { params.lyrics = lyrics; }
      if (!randomSeed && seed) params.seed = parseInt(seed, 10);
      if (showAdvanced) {
        if (bpm) params.bpm = parseInt(bpm, 10);
        if (key) params.key = key;
        if (timeSig) params.timesignature = timeSig;
        // Only override when the user has actually moved the slider; otherwise
        // the server keeps its template default and we don't lock the value in.
        if (stepsTouched) params.steps = Math.round(steps);
        if (tempTouched) params.temperature = Number(temperature.toFixed(2));
      }
      if (cloneOn && voice) params.voiceModel = voice;
      await api.generate(params);
      Alert.alert("Generating", "Your track is in the queue. Check the Library tab.");
      setDraftLyrics("");
      onCreated();
    } catch (e) {
      Alert.alert("Failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  const languageItems = (opts?.languages || ["en"]).map((c) => ({ label: languageLabel(c), value: c }));
  const qualityItems = [
    { label: "V0 — Best VBR (~220–260 kbps)", value: "V0" },
    { label: "320k — Highest CBR", value: "320k" },
    { label: "128k — Smaller file", value: "128k" },
  ];
  const keyItems = [{ label: "Default", value: "" }, ...(opts?.keys || []).map((k) => ({ label: k, value: k }))];
  const timeSigItems = [{ label: "Default", value: "" }, ...(opts?.timeSignatures || []).map((t) => ({ label: `${t}/4`, value: t }))];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.h1}>New track</Text>

      <Text style={styles.label}>Title (optional)</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="My song" placeholderTextColor={colors.textFade} />

      <Text style={styles.label}>Style / genre</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={style}
        onChangeText={setStyle}
        placeholder="Modern R&B, warm and heartfelt, radio-ready glow. Crisp electronic
drums, airy synth pads, rolling bassline, tight vocal stacks and
harmonies. Tender verses building to a full, soulful chorus. Clean
production, smooth male/female lead vocal, 75 BPM, key of A major."
        placeholderTextColor={colors.textFade}
        multiline
      />

      <View style={styles.row}>
        <Text style={styles.label}>✨ Write lyrics for me</Text>
        <Switch value={writeLyrics} onValueChange={setWriteLyrics} />
      </View>
      {writeLyrics ? (
        <>
          <Text style={styles.label}>Theme (what should the song be about?)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={theme}
            onChangeText={setTheme}
            placeholder="e.g. a road trip with friends in the summer"
            placeholderTextColor={colors.textFade}
            multiline
          />
          <TouchableOpacity style={styles.secondaryBtn} onPress={writeLyricsNow} disabled={writing}>
            {writing ? <ActivityIndicator color={colors.accent} /> : (
              <Text style={styles.secondaryText}>{draftLyrics ? "↻ Rewrite lyrics" : "✍️ Write lyrics"}</Text>
            )}
          </TouchableOpacity>
          {draftLyrics ? (
            <>
              <Text style={styles.label}>Generated lyrics (edit if you like)</Text>
              <TextInput
                style={[styles.input, styles.multilineTall]}
                value={draftLyrics}
                onChangeText={setDraftLyrics}
                placeholderTextColor={colors.textFade}
                multiline
              />
              <Text style={styles.hint}>These exact lyrics will be used. Edit, rewrite, or generate music below.</Text>
            </>
          ) : (
            <Text style={styles.hint}>Tap “Write lyrics” to preview them before generating music.</Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>Lyrics</Text>
          <TextInput
            style={[styles.input, styles.multilineTall]}
            value={lyrics}
            onChangeText={setLyrics}
            placeholder={"[verse]\n...\n[chorus]\n...\n\n(or leave blank / type [inst] for instrumental)"}
            placeholderTextColor={colors.textFade}
            multiline
          />
        </>
      )}

      <Text style={styles.label}>Language (of the lyrics)</Text>
      <Dropdown selectedValue={language} onValueChange={setLanguage} items={languageItems} />

      <Text style={styles.label}>MP3 quality</Text>
      <Dropdown selectedValue={quality} onValueChange={setQuality} items={qualityItems} />
      <Text style={styles.hint}>Higher bitrate = larger file, better sound.</Text>

      {voices.length > 0 && (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>🎤 Clone a voice</Text>
            <Switch
              value={cloneOn}
              onValueChange={(v) => { setCloneOn(v); if (v && !voice) setVoice(voices[0].file); }}
            />
          </View>
          {cloneOn && (
            <>
              <Dropdown
                selectedValue={voice}
                onValueChange={setVoice}
                items={voices.map((v) => ({ label: v.name, value: v.file }))}
              />
              <Text style={styles.hint}>The AI sings, then its vocal is converted to this voice. Only use voices you have permission to clone.</Text>
            </>
          )}
        </>
      )}

      <Text style={styles.label}>Duration: {Math.round(duration)}s</Text>
      <Slider
        minimumValue={15}
        maximumValue={240}
        step={5}
        value={duration}
        onValueChange={setDuration}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.surface3}
        thumbTintColor={colors.accent}
      />

      <View style={styles.row}>
        <Text style={styles.label}>Random seed</Text>
        <Switch value={randomSeed} onValueChange={setRandomSeed} />
      </View>
      {!randomSeed && (
        <TextInput style={styles.input} value={seed} onChangeText={setSeed} placeholder="seed (number)" keyboardType="number-pad" placeholderTextColor={colors.textFade} />
      )}

      <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)}>
        <Text style={styles.advanced}>{showAdvanced ? "▾ Advanced" : "▸ Advanced"}</Text>
      </TouchableOpacity>
      {showAdvanced && (
        <View>
          <Text style={styles.label}>BPM</Text>
          <TextInput style={styles.input} value={bpm} onChangeText={setBpm} placeholder="10–300 (blank = default)" keyboardType="number-pad" placeholderTextColor={colors.textFade} />
          <Text style={styles.label}>Key / scale</Text>
          <Dropdown selectedValue={key} onValueChange={setKey} items={keyItems} />
          <Text style={styles.label}>Time signature</Text>
          <Dropdown selectedValue={timeSig} onValueChange={setTimeSig} items={timeSigItems} />

          <Text style={styles.label}>Sampling steps: {Math.round(steps)}</Text>
          <Slider
            minimumValue={8}
            maximumValue={60}
            step={1}
            value={steps}
            onValueChange={(v) => { setSteps(v); setStepsTouched(true); }}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.surface3}
            thumbTintColor={colors.accent}
          />
          <Text style={styles.hint}>More steps = better clarity, slower generation. 30 is balanced; 40+ for studio.</Text>

          <Text style={styles.label}>Vocal temperature: {temperature.toFixed(2)}</Text>
          <Slider
            minimumValue={0.4}
            maximumValue={1.2}
            step={0.05}
            value={temperature}
            onValueChange={(v) => { setTemperature(v); setTempTouched(true); }}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.surface3}
            thumbTintColor={colors.accent}
          />
          <Text style={styles.hint}>Lower = more confident pronunciation (crisper). Higher = more expressive but mushier.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Generate track</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: space.lg },
  h1: { ...typography.h1, color: colors.text, marginBottom: space.lg },
  label: { ...typography.meta, color: colors.textMute, marginTop: space.md, marginBottom: space.xs },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "transparent",
  },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  hint: { ...typography.caption, color: colors.textFade, marginTop: space.xs, fontStyle: "italic" },
  multilineTall: { minHeight: 150, textAlignVertical: "top" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.md },
  advanced: { ...typography.body, color: colors.accent, marginTop: space.xl, fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 14, paddingHorizontal: space.lg, alignItems: "center", marginTop: space.md,
  },
  secondaryText: { ...typography.body, color: colors.accent, fontWeight: "700" },
  button: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", marginTop: space.xxl,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
});
