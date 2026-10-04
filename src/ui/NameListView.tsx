import { type FormEvent, useCallback, useId, useState } from 'react';
import { TEXT_LIMITS } from '../domain/shared/text.ts';
import { Field, FormError, text, useData } from './common.tsx';
import { toErrors } from './errors.ts';
import { useServices } from './services-context.tsx';
import { t } from './i18n/index.ts';

interface Named {
  readonly id: string;
  readonly name: string;
}

interface NameListProps<T extends Named> {
  title: string;
  addLabel: string;
  emptyText: string;
  load: () => Promise<T[]>;
  /** Deactivated member / archived category. */
  isHidden: (item: T) => boolean;
  hiddenTitle: string;
  hideLabel: string;
  unhideLabel: string;
  create: (name: string) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  setHidden: (id: string, hidden: boolean) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

/** Members and categories share one screen: a name, a hide flag, delete only when unreferenced (ADR-009). */
function NameList<T extends Named>(p: NameListProps<T>) {
  const { data: items, error, reload } = useData(p.load);
  const [editing, setEditing] = useState<string | null>(null);
  const headingId = useId();
  // Errors are shown next to the form or row that caused them ('new' = the add form).
  const [failed, setFailed] = useState<{ target: string; errors: Record<string, string> } | null>(null);

  async function run(target: string, action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      setFailed(null);
      setEditing(null);
      reload();
      return true;
    } catch (e) {
      setFailed({ target, errors: toErrors(e) });
      return false;
    }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (await run('new', () => p.create(text(new FormData(form), 'name')))) form.reset();
  }

  function remove(item: T) {
    if (window.confirm(t('ui.confirmDelete', { name: item.name }))) void run(item.id, () => p.remove(item.id));
  }

  const errorsOf = (target: string) => (failed?.target === target ? failed.errors : {});

  const row = (item: T) => (
    <li key={item.id} className="row">
      {editing === item.id ? (
        <form
          className="row__edit"
          onSubmit={(e) => {
            e.preventDefault();
            void run(item.id, () => p.rename(item.id, text(new FormData(e.currentTarget), 'name')));
          }}
        >
          <Field label={t('ui.newName', { name: item.name })} name="name" errors={errorsOf(item.id)}>
            <input name="name" defaultValue={item.name} required maxLength={TEXT_LIMITS.name} autoFocus />
          </Field>
          <button>{t('common.save')}</button>
          <button type="button" onClick={() => setEditing(null)}>
            {t('common.cancel')}
          </button>
        </form>
      ) : (
        <>
          <span className="row__main">{item.name}</span>
          <span className="row__actions">
            <button type="button" aria-label={`${t('ui.rename')} ${item.name}`} onClick={() => setEditing(item.id)}>
              {t('ui.rename')}
            </button>
            <button
              type="button"
              aria-label={`${p.isHidden(item) ? p.unhideLabel : p.hideLabel} ${item.name}`}
              onClick={() => void run(item.id, () => p.setHidden(item.id, !p.isHidden(item)))}
            >
              {p.isHidden(item) ? p.unhideLabel : p.hideLabel}
            </button>
            <button type="button" aria-label={t('ui.deleteNamed', { name: item.name })} onClick={() => remove(item)}>
              {t('common.delete')}
            </button>
          </span>
        </>
      )}
      <FormError errors={errorsOf(item.id)} />
    </li>
  );

  const visible = items?.filter((i) => !p.isHidden(i)) ?? [];
  const hidden = items?.filter(p.isHidden) ?? [];

  return (
    <section className="panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{p.title}</h2>
      <form className="inline-form" onSubmit={add}>
        <Field label={p.addLabel} name="name" errors={errorsOf('new')}>
          <input name="name" required maxLength={TEXT_LIMITS.name} />
        </Field>
        <button>{t('common.add')}</button>
      </form>
      <FormError errors={errorsOf('new')} />
      {error && <p role="alert">{error}</p>}
      {items && visible.length === 0 && <p className="muted">{p.emptyText}</p>}
      <ul className="list">{visible.map(row)}</ul>
      {hidden.length > 0 && (
        <>
          <h3>{p.hiddenTitle}</h3>
          <ul className="list list--hidden">{hidden.map(row)}</ul>
        </>
      )}
    </section>
  );
}

export function MembersView() {
  const { members } = useServices();
  const load = useCallback(() => members.list(), [members]);
  return (
    <NameList
       title={t('app.members')}
       addLabel={t('ui.newMember')}
       emptyText={t('ui.noMembers')}
      load={load}
      isHidden={(m) => !m.active}
       hiddenTitle={t('ui.inactive')}
       hideLabel={t('ui.deactivate')}
       unhideLabel={t('ui.reactivate')}
      create={(name) => members.create({ name })}
      rename={(id, name) => members.rename({ id, name })}
      setHidden={(id, hidden) => members.setActive({ id, active: !hidden })}
      remove={(id) => members.delete(id)}
    />
  );
}

export function CategoriesView() {
  const { categories } = useServices();
  const load = useCallback(() => categories.list({ includeArchived: true }), [categories]);
  return (
    <NameList
       title={t('app.categories')}
       addLabel={t('ui.newCategory')}
       emptyText={t('ui.noCategories')}
      load={load}
      isHidden={(c) => c.archived}
       hiddenTitle={t('ui.archived')}
       hideLabel={t('ui.archive')}
       unhideLabel={t('ui.unarchive')}
      create={(name) => categories.create({ name })}
      rename={(id, name) => categories.rename({ id, name })}
      setHidden={(id, archived) => categories.setArchived({ id, archived })}
      remove={(id) => categories.delete(id)}
    />
  );
}
