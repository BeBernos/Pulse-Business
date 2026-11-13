import { useDeferredValue, useState } from "react";
import type { Exercise } from "../db";
import { useLibrary, useSettings } from "../hooks";
import { groupsFor, norm } from "../lib/groups";
import { BodyFigure } from "./BodyFigure";
import { Icon } from "./Icon";
import { MotionFigure } from "./MotionFigure";
import { Sheet } from "./ui";

import { tr } from "../i18n";
/**
 * Seletor de exercícios em folha inferior: grupos musculares com boneco → lista com busca.
 * `multi`: marca vários e confirma; senão, escolhe um e fecha.
 */
export function ExercisePicker({ open, onClose, onPick, multi = false, title = tr("Adicionar exercício") }: { open: boolean; onClose: () => void; onPick: (ex: Exercise[]) => void; multi?: boolean; title?: string }) {
  const settings = useSettings();
  const library = useLibrary();
  const [group, setGroup] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const dq = useDeferredValue(q);

  const close = () => {
    setGroup(null);
    setQ("");
    setPicked([]);
    onClose();
  };
  const confirm = (names: string[]) => {
    const byName = new Map(library?.map((e) => [e.name, e]));
    onPick(names.map((n) => byName.get(n)!).filter(Boolean));
    close();
  };

  const terms = norm(dq).split(/\s+/).filter(Boolean);
  const list = (library ?? []).filter(
    (e) => !e.vetoed && (!group || e.group === group) && terms.every((t) => norm(`${e.name} ${e.equipment} ${e.pattern} ${tr(e.group)}`).includes(t)),
  );
  const browsing = !group && !terms.length;

  return (
    <Sheet
      open={open}
      onClose={close}
      footer={
        multi && picked.length > 0 ? (
          <button className="btn primary block" onClick={() => confirm(picked)}>
            <Icon name="plus" /> {tr("Adicionar")} {picked.length} {tr("exercício")}{picked.length > 1 ? "s" : ""}
          </button>
        ) : undefined
      }
    >
      <div className="stack">
        <div className="row">
          {group && (
            <button className="icon-btn" onClick={() => setGroup(null)} aria-label={tr("Voltar aos grupos")}>
              <Icon name="back" />
            </button>
          )}
          <div className="title-md grow">{group ?? title}</div>
        </div>
        <label className="search">
          <Icon name="search" size={18} />
          <input className="input" type="search" placeholder={tr("Buscar exercício, aparelho…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        {browsing ? (
          <div className="grid-3">
            {groupsFor(settings?.focus).map((g) => (
              <button key={g.name} className="card tap center" style={{ padding: "10px 6px" }} onClick={() => setGroup(g.name)}>
                <div style={{ display: "flex", justifyContent: "center", height: 74, overflow: "hidden" }}>
                  <BodyFigure side={g.side} selected={new Set(g.muscles)} width={46} decorative />
                </div>
                <div className="small bold" style={{ marginTop: 6 }}>{tr(g.name)}</div>
                <div className="tiny dim">{library?.filter((e) => e.group === g.name).length ?? 0}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="group">
            {list.slice(0, 120).map((e) => {
              const on = picked.includes(e.name);
              return (
                <button
                  key={e.name}
                  className="item"
                  onClick={() => (multi ? setPicked((p) => (on ? p.filter((x) => x !== e.name) : [...p, e.name])) : confirm([e.name]))}
                >
                  <div className="thumb"><MotionFigure name={e.name} group={e.group} muscles={e.muscles} animate={false} aspect={1} label="" /></div>
                  <div className="grow">
                    <div className="t">{e.name}</div>
                    <div className="s">{[e.group, e.equipment, e.pattern].filter(Boolean).join(" · ")}</div>
                  </div>
                  {multi ? (
                    <span className="ico" style={{ ["--c" as string]: on ? "var(--accent)" : "var(--text-3)", width: 30, height: 30, borderRadius: 10 }}>
                      {on ? <Icon name="check" size={16} stroke={3} /> : <Icon name="plus" size={16} />}
                    </span>
                  ) : (
                    <Icon name="plus" size={18} />
                  )}
                </button>
              );
            })}
            {!list.length && <div className="empty small">{tr("Nada encontrado. Cadastre o exercício na aba Exercícios.")}</div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
