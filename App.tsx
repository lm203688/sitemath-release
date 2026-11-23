import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as D from './src/domain';
import { GROUPS, TOOLS, encodeValue, parseFieldValue, toolById, type Field, type Tool, type Units } from './src/tools';

type Screen = { kind: 'list' } | { kind: 'tool'; id: string } | { kind: 'job' };

type StoredJob = { lines: D.JobLine[] };

const JOB_FILE = (() => {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}sitemath-job.json` : null;
})();

export default function App() {
  const [units, setUnits] = useState<Units>('imperial');
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const [job, setJob] = useState<D.JobLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ——— 持久化：本活只写在 Documents 下，不联网 ———
  useEffect(() => {
    if (!JOB_FILE) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(JOB_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(JOB_FILE);
          const parsed = JSON.parse(raw) as StoredJob;
          if (Array.isArray(parsed.lines)) setJob(parsed.lines);
        }
      } catch {
        // 文件损坏就当作空活，不阻塞启动
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!JOB_FILE || !loaded) return;
    const payload: StoredJob = { lines: job };
    FileSystem.writeAsStringAsync(JOB_FILE, JSON.stringify(payload)).catch(() => {});
  }, [job, loaded]);

  const textFor = useCallback(
    (t: Tool, f: Field): string => {
      const stored = values[t.id]?.[f.key];
      if (stored != null) return stored;
      return encodeValue(f, f.def, units);
    },
    [values, units]
  );

  const setFieldText = useCallback((toolId: string, key: string, text: string) => {
    setValues((prev) => ({ ...prev, [toolId]: { ...(prev[toolId] ?? {}), [key]: text } }));
  }, []);

  const resetTool = useCallback((toolId: string) => {
    setValues((prev) => {
      const next = { ...prev };
      delete next[toolId];
      return next;
    });
  }, []);

  const toggleUnits = useCallback(
    (next: Units) => {
      if (next === units) return;
      setValues((prev) => {
        const out: Record<string, Record<string, string>> = {};
        for (const t of TOOLS) {
          const row = prev[t.id];
          if (!row) continue;
          const converted: Record<string, string> = {};
          for (const f of t.fields) {
            const text = row[f.key];
            if (text == null) continue;
            const canonical = parseFieldValue(f, text, units);
            converted[f.key] = encodeValue(f, canonical, next);
          }
          out[t.id] = converted;
        }
        return out;
      });
      setUnits(next);
    },
    [units]
  );

  const addToJob = useCallback((tool: Tool, items: { label: string; qty: number; unit: string }[]) => {
    setJob((prev) => {
      let next = prev;
      for (const item of items) {
        if (!(item.qty > 0)) continue;
        const base = D.newJobLine(tool.name, item.label, item.qty, item.unit);
        const line: D.JobLine = { ...base, id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
        next = D.addLine(next, line);
      }
      return next;
    });
    setScreen({ kind: 'job' });
  }, []);

  const setPrice = useCallback((id: string, priceText: string) => {
    const n = Number(priceText.replace(',', '.'));
    setJob((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const unitPrice = Number.isFinite(n) && priceText.trim() !== '' ? n : undefined;
        return { ...l, unitPrice, total: unitPrice != null ? Math.round(l.qty * unitPrice * 100) / 100 : undefined };
      })
    );
  }, []);

  const removeLine = useCallback((id: string) => {
    setJob((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const shareJob = useCallback(async () => {
    if (job.length === 0) return;
    try {
      await Share.share({ message: D.jobToText(job) });
    } catch {
      // 用户取消分享，忽略
    }
  }, [job]);

  const total = useMemo(() => D.jobTotal(job), [job]);

  if (screen.kind === 'tool') {
    const tool = toolById(screen.id);
    if (!tool) return <ListScreen tools={TOOLS} units={units} onToggleUnits={toggleUnits} onOpen={(id) => setScreen({ kind: 'tool', id })} job={job} onJob={() => setScreen({ kind: 'job' })} />;
    return (
      <ToolScreen
        tool={tool}
        units={units}
        textFor={textFor}
        onChange={setFieldText}
        choiceFor={(key) => choices[tool.id]?.[key] ?? tool.choices?.find((c) => c.key === key)?.def ?? ''}
        onChoice={(key, value) => setChoices((prev) => ({ ...prev, [tool.id]: { ...(prev[tool.id] ?? {}), [key]: value } }))}
        onReset={() => resetTool(tool.id)}
        onBack={() => setScreen({ kind: 'list' })}
        onAdd={(items) => addToJob(tool, items)}
      />
    );
  }

  if (screen.kind === 'job') {
    return (
      <JobScreen
        job={job}
        total={total}
        onPrice={setPrice}
        onRemove={removeLine}
        onClear={() => setJob([])}
        onShare={shareJob}
        onBack={() => setScreen({ kind: 'list' })}
      />
    );
  }

  return (
    <ListScreen
      tools={TOOLS}
      units={units}
      onToggleUnits={toggleUnits}
      onOpen={(id) => setScreen({ kind: 'tool', id })}
      job={job}
      onJob={() => setScreen({ kind: 'job' })}
    />
  );
}

// ——————————————————— 列表页 ———————————————————

function ListScreen(props: {
  tools: Tool[];
  units: Units;
  onToggleUnits: (u: Units) => void;
  onOpen: (id: string) => void;
  job: D.JobLine[];
  onJob: () => void;
}) {
  const { tools, units, onToggleUnits, onOpen, job, onJob } = props;
  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>SiteMath</Text>
            <Text style={S.subtitle}>Material takeoff · offline · no account</Text>
          </View>
          <UnitSwitch units={units} onChange={onToggleUnits} />
        </View>
      </View>
      <ScrollView contentContainerStyle={S.listBody}>
        {GROUPS.map((group) => {
          const items = tools.filter((t) => t.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group} style={S.groupBlock}>
              <Text style={S.groupTitle}>{group.toUpperCase()}</Text>
              {items.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => onOpen(t.id)}
                  style={({ pressed }) => [S.toolRow, pressed && S.pressed]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={S.toolName}>{t.name}</Text>
                    <Text style={S.toolBlurb}>{t.blurb}</Text>
                  </View>
                  <Text style={S.chev}>›</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
        <Text style={S.footerNote}>
          {D.REFERENCE_DISCLAIMER}
        </Text>
      </ScrollView>
      <JobBar job={job} onPress={onJob} />
    </View>
  );
}

function UnitSwitch(props: { units: Units; onChange: (u: Units) => void }) {
  const { units, onChange } = props;
  return (
    <View style={S.switch}>
      {(['imperial', 'metric'] as Units[]).map((u) => {
        const active = units === u;
        return (
          <Pressable
            key={u}
            onPress={() => onChange(u)}
            style={[S.switchBtn, active && S.switchBtnActive]}
          >
            <Text style={[S.switchText, active && S.switchTextActive]}>{u === 'imperial' ? 'US' : 'Metric'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function JobBar(props: { job: D.JobLine[]; onPress: () => void }) {
  const { job, onPress } = props;
  const total = D.jobTotal(job);
  const hasPrice = job.some((l) => l.unitPrice != null);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [S.jobBar, pressed && S.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={S.jobBarTitle}>Job takeoff</Text>
        <Text style={S.jobBarSub}>
          {job.length === 0 ? 'No lines yet' : `${job.length} line${job.length === 1 ? '' : 's'}${hasPrice ? ` · $${total.toFixed(2)}` : ''}`}
        </Text>
      </View>
      <Text style={S.jobBarChev}>›</Text>
    </Pressable>
  );
}

// ——————————————————— 单工具页 ———————————————————

function ToolScreen(props: {
  tool: Tool;
  units: Units;
  textFor: (t: Tool, f: Field) => string;
  onChange: (toolId: string, key: string, text: string) => void;
  choiceFor: (key: string) => string;
  onChoice: (key: string, value: string) => void;
  onReset: () => void;
  onBack: () => void;
  onAdd: (items: { label: string; qty: number; unit: string }[]) => void;
}) {
  const { tool, units, textFor, onChange, choiceFor, onChoice, onReset, onBack, onAdd } = props;

  const numbers = useMemo(() => {
    const n: Record<string, number> = {};
    for (const f of tool.fields) {
      n[f.key] = parseFieldValue(f, textFor(tool, f), units);
    }
    return n;
  }, [tool, textFor, units]);

  const sections = useMemo(() => {
    const s: Record<string, string> = {};
    for (const c of tool.choices ?? []) s[c.key] = choiceFor(c.key);
    return s;
  }, [tool, choiceFor]);

  const out = useMemo(() => {
    try {
      return tool.calc(numbers, sections, units);
    } catch {
      return { primary: '—', primaryUnit: '', rows: [], note: 'Check your inputs', job: [] };
    }
  }, [tool, numbers, sections, units]);

  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <Pressable onPress={onBack} style={S.backBtn} hitSlop={12}>
          <Text style={S.backText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.toolTitle}>{tool.name}</Text>
          <Text style={S.toolBlurb}>{tool.blurb}</Text>
        </View>
        <Pressable onPress={onReset} hitSlop={10}>
          <Text style={S.reset}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={S.body} keyboardShouldPersistTaps="handled">
        {tool.fields.map((f) => (
          <View key={f.key} style={S.fieldRow}>
            <Text style={S.fieldLabel}>{f.label}</Text>
            <View style={S.inputWrap}>
              <TextInput
                value={textFor(tool, f)}
                onChangeText={(t) => onChange(tool.id, f.key, t)}
                style={S.input}
                keyboardType={f.kind === 'length' && units === 'imperial' ? 'numbers-and-punctuation' : 'decimal-pad'}
                placeholder={f.kind === 'length' ? (units === 'imperial' ? `10' 6"` : '3.05') : '0'}
                placeholderTextColor="#9AA7AE"
                selectTextOnFocus
                returnKeyType="done"
              />
              <Text style={S.inputUnit}>{fieldUnit(f, units)}</Text>
            </View>
          </View>
        ))}

        {(tool.choices ?? []).map((c) => (
          <View key={c.key} style={S.choiceBlock}>
            <Text style={S.fieldLabel}>{c.label}</Text>
            <View style={S.chips}>
              {c.options.map((o) => {
                const active = sections[c.key] === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => onChoice(c.key, o.value)}
                    style={[S.chip, active && S.chipActive]}
                  >
                    <Text style={[S.chipText, active && S.chipTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <View style={S.resultCard}>
          <Text style={S.resultLabel}>Result</Text>
          <View style={S.resultRow}>
            <Text style={S.resultValue}>{out.primary}</Text>
            {out.primaryUnit ? <Text style={S.resultUnit}>{out.primaryUnit}</Text> : null}
          </View>
        </View>

        {out.rows.length > 0 && (
          <View style={S.rowsCard}>
            {out.rows.map((r, i) => (
              <View key={`${r.label}-${i}`} style={S.rowLine}>
                <Text style={S.rowLabel}>{r.label}</Text>
                <Text style={S.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={S.note}>{out.note}</Text>

        {out.job.length > 0 && (
          <Pressable onPress={() => onAdd(out.job)} style={({ pressed }) => [S.addBtn, pressed && S.pressed]}>
            <Text style={S.addBtnText}>Add to job takeoff</Text>
          </Pressable>
        )}

        <Text style={S.disclaimer}>{D.REFERENCE_DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

// ——————————————————— 本活页 ———————————————————

function JobScreen(props: {
  job: D.JobLine[];
  total: number;
  onPrice: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onShare: () => void;
  onBack: () => void;
}) {
  const { job, total, onPrice, onRemove, onClear, onShare, onBack } = props;
  const hasPrice = job.some((l) => l.unitPrice != null);

  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <Pressable onPress={onBack} style={S.backBtn} hitSlop={12}>
          <Text style={S.backText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.toolTitle}>Job takeoff</Text>
          <Text style={S.toolBlurb}>{job.length} line{job.length === 1 ? '' : 's'} · add a unit price to see the total</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.body} keyboardShouldPersistTaps="handled">
        {job.length === 0 ? (
          <View style={S.emptyJob}>
            <Text style={S.emptyTitle}>Nothing here yet</Text>
            <Text style={S.emptySub}>Run a calculator and tap “Add to job takeoff”.</Text>
          </View>
        ) : (
          job.map((l) => (
            <View key={l.id} style={S.jobRow}>
              <View style={{ flex: 1 }}>
                <Text style={S.jobLabel}>{l.label}</Text>
                <Text style={S.jobMeta}>{l.tool} · {l.qty} {l.unit}</Text>
              </View>
              <View style={S.priceWrap}>
                <Text style={S.pricePrefix}>$</Text>
                <TextInput
                  value={l.unitPrice != null ? String(l.unitPrice) : ''}
                  onChangeText={(t) => onPrice(l.id, t)}
                  keyboardType="decimal-pad"
                  placeholder="each"
                  placeholderTextColor="#9AA7AE"
                  style={S.priceInput}
                />
              </View>
              <Pressable onPress={() => onRemove(l.id)} hitSlop={10} style={S.removeBtn}>
                <Text style={S.removeText}>×</Text>
              </Pressable>
            </View>
          ))
        )}

        {job.length > 0 && (
          <View style={S.totalCard}>
            <Text style={S.totalLabel}>Total</Text>
            <Text style={S.totalValue}>{hasPrice ? `$${total.toFixed(2)}` : '—'}</Text>
          </View>
        )}

        {job.length > 0 && (
          <View style={S.jobActions}>
            <Pressable onPress={onShare} style={({ pressed }) => [S.addBtn, pressed && S.pressed]}>
              <Text style={S.addBtnText}>Share material list</Text>
            </Pressable>
            <Pressable onPress={onClear} style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]}>
              <Text style={S.ghostBtnText}>Clear all</Text>
            </Pressable>
          </View>
        )}

        <Text style={S.disclaimer}>{D.REFERENCE_DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

// ——————————————————— 样式 ———————————————————

const fieldUnit = (f: Field, u: Units): string => {
  if (f.kind === 'length') return u === 'imperial' ? 'ft-in' : 'm';
  if (f.kind === 'area') return u === 'imperial' ? 'sq ft' : 'm²';
  if (f.kind === 'percent') return '%';
  return '';
};

const INK = '#15232B';
const SUB = '#5A6B75';
const LINE = '#DFE5E2';
const ACCENT = '#C9531F';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F3' },
  header: {
    paddingTop: 58,
    paddingBottom: 12,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LINE,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: INK, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: SUB, marginTop: 2 },
  toolTitle: { fontSize: 18, fontWeight: '700', color: INK },
  toolBlurb: { fontSize: 12, color: SUB, marginTop: 2 },
  switch: { flexDirection: 'row', backgroundColor: '#EDF1EE', borderRadius: 9, padding: 2 },
  switchBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  switchBtnActive: { backgroundColor: INK },
  switchText: { fontSize: 12, fontWeight: '600', color: SUB },
  switchTextActive: { color: '#FFFFFF' },
  listBody: { padding: 16, paddingBottom: 28 },
  groupBlock: { marginBottom: 18 },
  groupTitle: { fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  pressed: { opacity: 0.7 },
  toolName: { fontSize: 15, fontWeight: '600', color: INK },
  chev: { fontSize: 20, color: '#B3BFC3', marginLeft: 8 },
  footerNote: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 8 },
  jobBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INK,
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  jobBarTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  jobBarSub: { color: '#9FB0B8', fontSize: 12, marginTop: 2 },
  jobBarChev: { color: '#FFFFFF', fontSize: 20 },
  backBtn: { paddingRight: 12, paddingBottom: 2 },
  backText: { fontSize: 15, color: ACCENT, fontWeight: '600' },
  reset: { fontSize: 13, color: SUB, marginBottom: 2 },
  body: { padding: 16, paddingBottom: 40 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  fieldLabel: { flex: 1, fontSize: 14, color: INK },
  inputWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 118, justifyContent: 'flex-end' },
  input: {
    minWidth: 82,
    textAlign: 'right',
    fontSize: 15,
    color: INK,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  inputUnit: { fontSize: 11, color: '#8A979D', marginLeft: 4, width: 34, textAlign: 'right' },
  choiceBlock: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    marginRight: 8,
    marginTop: 4,
  },
  chipActive: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, color: INK, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  resultCard: { backgroundColor: INK, borderRadius: 14, padding: 18, marginTop: 14 },
  resultLabel: { color: '#9FB0B8', fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  resultValue: { color: '#FFFFFF', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  resultUnit: { color: '#D6E0E3', fontSize: 15, marginLeft: 8, marginBottom: 8 },
  rowsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  rowLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF2F0',
  },
  rowLabel: { fontSize: 14, color: SUB },
  rowValue: { fontSize: 14, color: INK, fontWeight: '600' },
  note: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 10 },
  addBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ghostBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  ghostBtnText: { color: SUB, fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 18 },
  emptyJob: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptySub: { fontSize: 13, color: SUB, marginTop: 6, textAlign: 'center' },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  jobLabel: { fontSize: 15, fontWeight: '600', color: INK },
  jobMeta: { fontSize: 11, color: SUB, marginTop: 2 },
  priceWrap: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  pricePrefix: { fontSize: 13, color: SUB, marginRight: 2 },
  priceInput: { minWidth: 62, textAlign: 'right', fontSize: 14, color: INK, fontWeight: '600', paddingVertical: 4 },
  removeBtn: { paddingLeft: 10 },
  removeText: { fontSize: 18, color: '#B3BFC3' },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: INK,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 10,
  },
  totalLabel: { color: '#9FB0B8', fontSize: 12, letterSpacing: 1.2, fontWeight: '700' },
  totalValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  jobActions: { marginTop: 6 },
});
