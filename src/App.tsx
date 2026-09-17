import { Tooltip } from 'radix-ui'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Command } from 'cmdk'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Choice } from '@/components/choice'
import { ChevronDown, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, FolderOpen, Undo2, Redo2, X, Check, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hasTag, imageUrl } from './model'
import type { Boot, Catalog } from './model'

function readView(): { sort: string; filter: string; workFilter: string; characterFilter: string; thumbnailSize: number } {
  try {
    const value = JSON.parse(localStorage.getItem('tagger-view') || '{}')
    return {
      thumbnailSize: Number.isFinite(value?.thumbnailSize) ? Math.max(80, Math.min(280, value.thumbnailSize)) : 125,
      sort: /^(name|modified|created)-(asc|desc)$/.test(value?.sort) ? value.sort : 'name-asc',
      filter: ['all', 'untagged', 'tagged'].includes(value?.filter) ? value.filter : 'all',
      workFilter: typeof value?.workFilter === 'string' ? value.workFilter : '',
      characterFilter: typeof value?.characterFilter === 'string' ? value.characterFilter : '',
    }
  } catch { return { sort: 'name-asc', filter: 'all', workFilter: '', characterFilter: '', thumbnailSize: 125 } }
}
function ShortcutTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip.Provider delayDuration={300}><Tooltip.Root><Tooltip.Trigger asChild onFocus={e=>e.preventDefault()}>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="bottom" sideOffset={6} className="z-50 flex items-center gap-1.5 rounded-md bg-neutral-700 px-2 py-1.5 text-[11px] text-white shadow-md"><span>Press</span><kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/40 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] leading-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)]">{label}</kbd><Tooltip.Arrow className="fill-neutral-700" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
}
export default function App() {
  const [initialView] = useState(readView)
  const [scrolled, setScrolled] = useState(false)
  const [menuHeight, setMenuHeight] = useState(56)
  const menuRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new ResizeObserver(() => setMenuHeight(node.getBoundingClientRect().height))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const [boot, setBoot] = useState<Boot | null>(null)
  const [doc, setDoc] = useState<Catalog | null>(null)
  const [organizing, setOrganizing] = useState(false)
  const [organizeResult, setOrganizeResult] = useState('')
  const [renameId, setRenameId] = useState('')
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('読み込み中')
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [work, setWork] = useState('')
  const [thumbnailSize, setThumbnailSize] = useState(initialView.thumbnailSize)
  const [sort, setSort] = useState(initialView.sort)
  const [filter, setFilter] = useState(initialView.filter)
  const [workFilter, setWorkFilter] = useState(initialView.workFilter)
  const [characterFilter, setCharacterFilter] = useState(initialView.characterFilter)
  const [tagQuery, setTagQuery] = useState('')
  const [workQuery, setWorkQuery] = useState('')
  const [workOpen, setWorkOpen] = useState(false)
  const [characterOpen, setCharacterOpen] = useState(false)
  const [history, setHistory] = useState<Catalog[]>([])
  const [future, setFuture] = useState<Catalog[]>([])
  const [zoom, setZoom] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const context = useRef('')
  const latest = useRef<Catalog | null>(null)
  const saved = useRef('')
  const revision = useRef(0)
  const inFlight = useRef(false)
  const failed = useRef(false)
  const serialize = (d: Catalog) => JSON.stringify({ tags: d.tags, images: d.images })

  useEffect(() => {
    let cancelled = false
    fetch('/api/state').then(async r => { if (!r.ok) throw Error('読み込めませんでした'); return r.json() as Promise<Boot> })
      .then(b => { if (cancelled) return; context.current = b.context; setBoot(b); setWorkFilter(current => b.document.tags.some(t => t.id === current && !t.parent) ? current : ''); setCharacterFilter(current => b.document.tags.some(t => t.id === current && t.parent === initialView.workFilter) ? current : ''); setDoc(b.document); latest.current = b.document; revision.current = b.document.revision; saved.current = serialize(b.document); setStatus('保存済み'); if (b.files[0]) { setActive(b.files[0]); setSelected([b.files[0]]) } })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [initialView.workFilter])

  useEffect(() => {
    try { localStorage.setItem('tagger-view', JSON.stringify({ sort, filter, workFilter, characterFilter, thumbnailSize })) } catch { /* 保存できない環境でも仕分けは継続する */ }
  }, [sort, filter, workFilter, characterFilter, thumbnailSize])
  const flush = useCallback(async () => {
    if (inFlight.current || failed.current || !latest.current) return
    inFlight.current = true
    try {
      while (latest.current && serialize(latest.current) !== saved.current) {
        const snapshot = latest.current
        setStatus('保存中…')
        const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...snapshot, revision: revision.current, context: context.current }) })
        const result = await response.json()
        if (!response.ok) throw Error(result.error || '保存できませんでした')
        revision.current = result.revision
        saved.current = serialize(snapshot)
      }
      setStatus('保存済み')
    } catch (e) { failed.current = true; setError((e as Error).message); setStatus('未保存') }
    finally { inFlight.current = false }
  }, [])

  useEffect(() => { if (!doc) return; const timer = setTimeout(() => void flush(), 300); return () => clearTimeout(timer) }, [doc, flush])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (latest.current && serialize(latest.current) !== saved.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function selectFolder() {
    setChoosingFolder(true)
    try {
      const response = await fetch('/api/folder', {method:'POST',headers:{'X-Tagger-Context':context.current}})
      const result = await response.json()
      if (!response.ok) throw Error(result.error)
      if (result.cancelled) return
      const b = result as Boot
      context.current=b.context; setBoot(b); setDoc(b.document); latest.current=b.document
      revision.current=b.document.revision; saved.current=serialize(b.document)
      setHistory([]); setFuture([]); setWork(''); setWorkFilter(''); setCharacterFilter(''); setFilter('all')
      setWorkQuery(''); setWorkOpen(false); setTagQuery(''); setActive(b.files[0] || ''); setSelected(b.files[0] ? [b.files[0]] : [])
      failed.current=false; setError(''); setStatus('保存済み')
    } catch(e) { setError((e as Error).message) }
    finally { setChoosingFolder(false) }
  }
  async function organize(action: string, extra: Record<string, unknown> = {}) {
    if (status !== '保存済み' || organizing) return
    setOrganizing(true); setError(''); setOrganizeResult('')
    try {
      const response = await fetch(`/api/${action}`, {method:'POST',headers:{'Content-Type':'application/json','X-Tagger-Context':context.current},body:JSON.stringify({files:selected,work,revision:revision.current,...extra})})
      const b=await response.json()
      if(!response.ok) throw Error(b.error)
      if(b.cancelled)return
      setBoot(b);setDoc(b.document);latest.current=b.document;revision.current=b.document.revision;saved.current=serialize(b.document)
      setHistory([]);setFuture([])
      if(b.result?.copied!==undefined)setOrganizeResult(`${b.result.copied}枚コピー・${b.result.skipped}件は既存画像を使用${b.result.errors.length ? ' ／ '+b.result.errors.join('、') : ''}`)
      if(action==='rename-tag')setRenaming(false)
    } catch(e) {setError((e as Error).message)} finally {setOrganizing(false)}
  }
  function commit(next: Catalog) {
    if (organizing || !doc || serialize(next) === serialize(doc)) return
    setFuture([]); setHistory(h => [...h.slice(-49), doc]); latest.current = next; setDoc(next); setStatus('未保存')
  }
  function undo() {
    const previous = history.at(-1)
    if (!previous || !doc) return
    setFuture(f => [...f.slice(-49), doc])
    setHistory(h => h.slice(0, -1)); if (!previous.tags.some(t => t.id === work)) setWork(''); if (!previous.tags.some(t => t.id === workFilter)) setWorkFilter(''); if (!previous.tags.some(t => t.id === characterFilter)) setCharacterFilter(''); latest.current = previous; setDoc(previous); setStatus('未保存')
  }
  function redo() {
    const next = future.at(-1)
    if (!next || !doc) return
    setHistory(h => [...h.slice(-49), doc]); setFuture(f => f.slice(0, -1))
    latest.current = next; setDoc(next); setStatus('未保存')
  }
  const files = [...(boot?.files || [])].sort((a, b) => {
    const byName = a.replace(/\.[^.]+$/, '').localeCompare(b.replace(/\.[^.]+$/, ''), 'ja', { numeric: true }) || a.localeCompare(b)
    const key = sort.split('-')[0]
    const byDate = key === 'name' ? 0 : (boot?.dates?.[a]?.[key as 'modified' | 'created'] || 0) - (boot?.dates?.[b]?.[key as 'modified' | 'created'] || 0)
    const order = byDate || byName
    return sort.endsWith('-desc') ? -order : order
  })
  const works = doc?.tags.filter(t => !t.parent) || []
  const characters = doc?.tags.filter(t => t.parent === work && t.name.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase())) || []
  const classified = (file: string) => boot?.destination ? !!boot.classification?.matches[file]?.length : !!doc?.images[file]?.length
  const effectiveTags = (file: string) => [...new Set([...(doc?.images[file]||[]),...(boot?.classification?.matches[file]||[]).flatMap(m=>{
    const parent=works.find(t=>t.name===m.parts[0]);if(!parent)return []
    const child=doc?.tags.find(t=>t.parent===parent.id&&t.name===m.parts[1]);return [child?.id||parent.id]
  })])]
  const visible = files.filter(file => (filter !== 'untagged' || !classified(file)) && (filter !== 'tagged' || classified(file)) && (!characterFilter || effectiveTags(file).includes(characterFilter)) && (!workFilter || hasTag(effectiveTags(file), workFilter, doc?.tags || [])))

  const tagged = files.filter(classified).length
  const selectedTags = doc ? doc.tags.filter(t => selected.some(f => doc.images[f]?.includes(t.id))) : []
  function navigate(delta: number) {
    if (!visible.length) return
    const idx = visible.indexOf(active)
    const file = visible[Math.max(0, Math.min(visible.length - 1, idx < 0 ? 0 : idx + delta))]
    setActive(file); setSelected([file])
    document.getElementById(`file-${files.indexOf(file)}`)?.scrollIntoView({ block: 'nearest' })
  }
  function applyTag(id: string) {
    if (!doc || !selected.length) return
    const allHave = selected.every(f => doc.images[f]?.includes(id))
    const images = { ...doc.images }
    for (const f of selected) { const previous = images[f] || []; images[f] = allHave ? previous.filter(t => t !== id) : [...new Set([...previous, id])] }
    commit({ ...doc, images })
  }
  function removeTag(id: string) {
    if (!doc) return
    const images = { ...doc.images }; for (const f of selected) images[f] = (images[f] || []).filter(t => t !== id)
    commit({ ...doc, images })
  }
  function addTag(parent?: string) {
    if (!doc) return
    const name = (parent ? tagQuery : workQuery).trim()
    if (!name) return
    const duplicate = doc.tags.find(t => t.name === name && t.parent === parent)
    const tag = duplicate || { id: crypto.randomUUID(), name, ...(parent ? { parent } : {}) }
    const images = { ...doc.images }
    if (parent) {
      for (const file of selected) images[file] = [...new Set([...(images[file] || []), tag.id])]
    }
    commit({ ...doc, tags: duplicate ? doc.tags : [...doc.tags, tag], images })
    if (parent) setTagQuery(''); else { setWorkQuery(''); setWork(tag.id); setTagQuery(''); setWorkOpen(false) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || organizing || renaming || choosingFolder || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],[role=combobox],[role=listbox],[role=option],[role=slider],[data-slot=popover-content]')) return
      if (zoom) return
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); setCharacterOpen(false); setWorkQuery(''); setWorkOpen(true); return }
        if (e.key === '2' && work) { e.preventDefault(); setWorkOpen(false); setTagQuery(''); setCharacterOpen(true); return }
      }
      if (e.key === 'Enter') { e.preventDefault(); navigate(1) }
      if (e.key === 'Backspace') { e.preventDefault(); navigate(-1) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  if (!boot || !doc) return <main className="p-12"><h1 className="text-xl font-semibold">Fandocker</h1><p className="my-4 text-sm text-muted-foreground">{error || '画像を読み込んでいます…'}</p>{error && <Button variant="outline" onClick={() => location.reload()}>再読み込み</Button>}</main>
  return <div className="relative flex h-dvh flex-col bg-background text-foreground">
    {error && <Alert variant="destructive" className="shrink-0 rounded-none border-x-0 border-t-0"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button size="sm" variant="outline" onClick={() => { failed.current = false; setError(''); void flush() }}>保存を再試行</Button></AlertDescription></Alert>}
        <div ref={menuRef} data-testid="menu-bar" className={cn("absolute inset-x-0 top-0 z-20 p-3 md:px-6 transition-colors", scrolled ? "bg-white/70 backdrop-blur-md" : "bg-white")}>
          <div className="flex flex-wrap items-center justify-end gap-2" data-testid="filters">
            <h1 className="mr-auto text-lg font-semibold leading-none">Fandocker</h1>
            <Popover><PopoverTrigger asChild><Button className="text-xs" size="sm" variant="outline">フィルタ</Button></PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3">
                <div className="space-y-1.5"><Label>分類状態</Label><Choice label="分類状態で絞り込み" value={filter} onValueChange={setFilter} options={[{value:'all',label:'すべて'},{value:'untagged',label:`未分類 ${files.length-tagged}`},{value:'tagged',label:`分類済み ${tagged}`}]} /></div>
                <div className="space-y-1.5"><Label>作品</Label><Choice label="作品で絞り込み" value={workFilter} onValueChange={v => {setWorkFilter(v);setCharacterFilter('')}} options={[{value:'',label:'全作品'},...works.map(t=>({value:t.id,label:t.name}))]} /></div>
                <div className="space-y-1.5"><Label>タグ</Label><Choice label="タグで絞り込み" value={characterFilter} disabled={!workFilter} onValueChange={setCharacterFilter} options={[{value:'',label:'全タグ'},...doc.tags.filter(t=>t.parent===workFilter).map(t=>({value:t.id,label:t.name}))]} /></div>
              </PopoverContent>
            </Popover>
            <Popover><PopoverTrigger asChild><Button className="text-xs" size="sm" variant="outline">表示</Button></PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-5">
                <div className="space-y-1.5"><Label>並び順</Label><ButtonGroup className="w-full min-w-0" aria-label="ソート">
              <Choice label="並び順" value={sort.split('-')[0]} onValueChange={v=>setSort(`${v}-${sort.split('-')[1]}`)} options={[{value:'name',label:'ファイル名'},{value:'modified',label:'更新日時'},{value:'created',label:'作成日時'}]} className="flex-1 pr-3" />
              <Button className="text-xs" variant="outline" size="icon" aria-label={sort.endsWith('-asc')?'昇順（クリックで降順）':'降順（クリックで昇順）'} onClick={()=>setSort(`${sort.split('-')[0]}-${sort.endsWith('-asc')?'desc':'asc'}`)}>{sort.endsWith('-asc')?<ArrowUp />:<ArrowDown />}</Button>
            </ButtonGroup></div>
                <div className="space-y-3"><Label htmlFor="thumbnail-size">サムネイルサイズ</Label><Slider id="thumbnail-size" aria-label="サムネイルサイズ" min={80} max={280} step={5} value={[thumbnailSize]} onValueChange={v=>setThumbnailSize(v[0])} /></div>
              </PopoverContent>
            </Popover>
        <Button className="text-xs" size="sm" variant="outline" disabled={status !== '保存済み' || choosingFolder} onClick={selectFolder}><FolderOpen />フォルダー選択</Button>

        <Popover><PopoverTrigger asChild><Button className="text-xs" size="sm" variant="outline">整理</Button></PopoverTrigger><PopoverContent align="end" className="w-80 space-y-3">
          <p className="break-all text-xs text-muted-foreground">{boot.destination||'整理先が未指定です'}</p>
          <Button variant="outline" disabled={organizing||status!=='保存済み'} onClick={()=>void organize('destination')}>整理先を選択</Button>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!boot.destination||organizing||status!=='保存済み'} onClick={()=>void organize('classification')}>再確認</Button><Button variant="outline" disabled={!boot.classification?.canUndo||organizing||status!=='保存済み'} onClick={()=>void organize('copy-undo')}>コピーを取り消す</Button></div>
          <Button variant="outline" disabled={!boot.destination||organizing||status!=='保存済み'} onClick={()=>setRenaming(true)}>作品・キャラ名を編集</Button>
          <a className="block text-xs underline" href="/api/export?kind=illustrations" download>YAMLを書き出す</a>
        </PopoverContent></Popover>
        <div role="group" aria-label="操作履歴" className="flex items-center gap-1.5">
          <Button className="text-xs" size="sm" variant="outline" disabled={!history.length} onClick={undo}><Undo2 />取り消す</Button>
          <Button className="text-xs" size="sm" variant="outline" disabled={!future.length} onClick={redo}><Redo2 />やり直す</Button>
        </div>
        <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-1.5 rounded-full bg-neutral-400', status === '保存済み' && 'bg-[#328455]')} />{status}</span>
          </div>
          {selected.length >= 2 && <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground" data-testid="selection-bar"><span>{visible.length} 枚表示 · {selected.length} 枚選択</span><Button variant="ghost" size="xs" onClick={()=>setSelected([])}>解除</Button></div>}
        </div>
    <main className="grid min-h-0 flex-1 grid-cols-1 max-[759px]:overflow-auto min-[760px]:grid-cols-[minmax(0,1fr)_minmax(320px,38%)] min-[1200px]:grid-cols-[minmax(0,1fr)_410px]">
      <section aria-label="画像一覧" className="flex min-h-0 min-w-0 flex-col max-[759px]:h-[52dvh]">
        <ScrollArea className="min-h-0 flex-1" scrollBarInsetTop={menuHeight} onScrollCapture={e=>setScrolled((e.target as HTMLElement).scrollTop>0)}>
          <div style={{paddingTop: menuHeight + 2, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${thumbnailSize}px), 1fr))`}} className="grid gap-3 pt-1 pb-3 pl-3 pr-3 md:pl-6 md:pb-6" data-testid="image-grid">
            {visible.map(file=><Card id={`file-${files.indexOf(file)}`} key={file} className={cn('relative gap-0 overflow-hidden rounded-lg border border-neutral-300 bg-white p-1 shadow-none ring-0 self-start',selected.includes(file)&&'border-neutral-600',active===file&&'ring-1 ring-neutral-500')}>
              <Button variant="ghost" aria-label={`${file}を表示`} className="relative aspect-square h-auto w-full rounded-md bg-white p-0 hover:bg-white active:translate-y-0" onClick={e=>{setActive(file);if(e.ctrlKey||e.metaKey)setSelected(s=>s.includes(file)?s.filter(f=>f!==file):[...s,file]);else if(e.shiftKey&&active&&visible.includes(active)){const a=visible.indexOf(active),b=visible.indexOf(file);setSelected(visible.slice(Math.min(a,b),Math.max(a,b)+1))}else setSelected([file])}}>
                <img src={imageUrl(file,boot.context)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain" />
              </Button>
              <Checkbox aria-label={`${file}を選択`} className="absolute top-2.5 left-2.5 bg-white" checked={selected.includes(file)} onCheckedChange={checked=>{setSelected(s=>checked===true?[...new Set([...s,file])]:s.filter(f=>f!==file));setActive(file)}} />
              <div className="truncate px-1 pt-2 pb-1 text-[11px]" title={file}>{file}</div>
            </Card>)}
            {!visible.length&&<p className="col-span-full p-10 text-center text-sm text-muted-foreground">該当する画像はありません</p>}
          </div>
        </ScrollArea>
      </section>
      <section aria-label="タグ付け" style={{marginTop: menuHeight}} className="relative m-3 min-[760px]:mr-6 min-h-0 min-w-0 overflow-hidden rounded-xl border border-neutral-300 bg-white">
        <ScrollArea className="h-full">
          <div className="p-4 pb-10 md:p-5 md:pb-10">
            {selected.length > 1 ? <div className="space-y-3" data-testid="multi-preview">
              <p className="text-sm font-medium">{selected.length}枚選択</p>
              <div className="grid grid-cols-[repeat(auto-fit,80px)] justify-center gap-3">
                {selected.slice(0,6).map(file=><div key={file} className="size-20 overflow-hidden rounded-lg border border-neutral-300 bg-white" title={file}><img src={imageUrl(file,boot.context)} alt={file} className="size-full object-contain" /></div>)}
              </div>
              {selected.length > 6 && <p className="text-center text-xs text-muted-foreground">ほか{selected.length - 6}枚</p>}
            </div> : <>
            <div className="mb-3 flex items-center justify-between gap-2 text-xs">
              <ShortcutTooltip label="Backspace"><Button variant="ghost" size="icon-sm"  aria-label="前の画像" onClick={()=>navigate(-1)} disabled={!visible.length}><ArrowLeft /></Button></ShortcutTooltip>
              <span className="truncate">{active||'画像を選択'}</span>
              <ShortcutTooltip label="Enter"><Button variant="ghost" size="icon-sm"  aria-label="次の画像" onClick={()=>navigate(1)} disabled={!visible.length}><ArrowRight /></Button></ShortcutTooltip>
            </div>
            {active?<Button variant="ghost" onClick={()=>setZoom(true)} aria-label="画像を拡大" className="relative h-[260px] w-full bg-white p-2 hover:bg-white active:translate-y-0 min-[1500px]:h-[330px]"><img src={imageUrl(active,boot.context)} alt={active} className="absolute inset-0 size-full object-contain" /></Button>:<p className="py-20 text-center text-sm text-muted-foreground">画像を選択してください</p>}
            </>}
            {boot.destination&&<div className="mt-4 space-y-2"><Button disabled={organizing||status!=='保存済み'||!selected.length||selected.some(f=>!doc.images[f]?.length&&!work)} onClick={()=>void organize('copy')}>{organizing?'処理中…':'選択画像を分類先へコピー'}</Button><p className="text-xs text-muted-foreground">元画像は残ります</p>{selected.length===1&&boot.classification?.matches[active]?.map(m=><p key={m.path} className="break-all text-xs text-muted-foreground">分類済み：{m.parts.join(' / ')||'整理先直下'}</p>)}{organizeResult&&<p role="status" className="text-xs">{organizeResult}</p>}</div>}
            <div className="mt-5 flex min-h-8 flex-wrap items-center gap-1.5">
              {selectedTags.map(t=><Button key={t.id} variant="secondary" size="sm" onClick={()=>removeTag(t.id)} title="選択した画像から外す" className="h-auto max-w-full whitespace-normal py-1.5 text-xs">{t.parent&&<span className="text-muted-foreground">{works.find(w=>w.id===t.parent)?.name} /</span>}{t.name}{selected.length>1&&<span className="text-muted-foreground">{selected.filter(f=>doc.images[f]?.includes(t.id)).length}/{selected.length}</span>}<X className="size-3" /></Button>)}
              {!selectedTags.length&&<span className="text-xs text-muted-foreground">まだタグが付いていません</span>}
            </div>
            <div className="mt-5 space-y-3">
              <Label htmlFor="work">作品</Label>
              <Popover open={workOpen} onOpenChange={open=>{setWorkOpen(open);if(open)setWorkQuery('')}}><ShortcutTooltip label="1"><PopoverTrigger asChild><Button id="work" variant="outline" className="group relative h-10 w-full justify-between pl-4 font-normal">{works.find(t=>t.id===work)?.name||'作品を選択'}<ChevronDown className="size-4 text-muted-foreground" /></Button></PopoverTrigger></ShortcutTooltip>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] space-y-2">
                  <Command shouldFilter={false}>
                    <Command.Input aria-label="作品を検索" placeholder="作品を検索・新規作成" value={workQuery} onValueChange={setWorkQuery} className="h-9 w-full rounded-md border border-input px-3 text-sm placeholder:text-muted-foreground" />
                    <Command.List className="max-h-64 overflow-y-auto [&_[cmdk-list-sizer]:not(:empty)]:pt-2">
                      {works.filter(t=>t.name.toLocaleLowerCase().includes(workQuery.toLocaleLowerCase())).map(t=><Command.Item key={t.id} value={t.id} onSelect={()=>{setWork(t.id);setTagQuery('');setWorkOpen(false)}} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent">{t.id===work&&<Check className="size-3" />}{t.name}</Command.Item>)}
                      {workQuery.trim()&&!works.some(t=>t.name===workQuery.trim())&&<Command.Item value="__create__" onSelect={()=>addTag()} className="cursor-pointer rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent">「{workQuery.trim()}」を作成</Command.Item>}
                    </Command.List>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {work&&<div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-2"><Label htmlFor="character-search">キャラ</Label></div>
              <Popover open={characterOpen} onOpenChange={setCharacterOpen}><ShortcutTooltip label="2"><PopoverTrigger asChild><Button variant="outline" className="group relative h-10 w-full justify-between pl-4 font-normal">キャラを選択<ChevronDown className="size-4 text-muted-foreground" /></Button></PopoverTrigger></ShortcutTooltip>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] space-y-2">
                  <Command shouldFilter={false}>
                    <Command.Input aria-label="キャラを検索" placeholder="キャラを検索・新規作成" value={tagQuery} onValueChange={setTagQuery} className="h-9 w-full rounded-md border border-input px-3 text-sm placeholder:text-muted-foreground" />
                    <Command.List className="max-h-64 overflow-y-auto [&_[cmdk-list-sizer]:not(:empty)]:pt-2">
                      {characters.map(t=><Command.Item key={t.id} value={t.id} onSelect={()=>{applyTag(t.id);setCharacterOpen(false)}} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent">{selected.some(f=>doc.images[f]?.includes(t.id))&&<Check className="size-3" />}{t.name}</Command.Item>)}
                      {tagQuery.trim()&&!doc.tags.some(t=>t.parent===work&&t.name===tagQuery.trim())&&<Command.Item value="__create__" onSelect={()=>{addTag(work);setCharacterOpen(false)}} className="cursor-pointer rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent">「{tagQuery.trim()}」を作成</Command.Item>}
                    </Command.List>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>}
          </div>
        </ScrollArea>
      </section>
    </main>
    <Dialog open={organizing}><DialogContent showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onInteractOutside={e=>e.preventDefault()}><DialogTitle className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />処理中</DialogTitle><DialogDescription>完了するまでお待ちください。</DialogDescription></DialogContent></Dialog>
    <Dialog open={renaming} onOpenChange={setRenaming}><DialogContent><DialogTitle>作品・キャラ名を編集</DialogTitle><DialogDescription>対応するフォルダーの名前を変更します。</DialogDescription><Choice label="編集する分類" value={renameId} onValueChange={id=>{setRenameId(id);setRenameName(doc.tags.find(t=>t.id===id)?.name||'')}} options={doc.tags.map(t=>({value:t.id,label:t.parent?`${works.find(w=>w.id===t.parent)?.name} / ${t.name}`:t.name}))} /><Input aria-label="新しい名前" value={renameName} onChange={e=>setRenameName(e.target.value)} /><Button disabled={!renameId||!renameName.trim()||organizing} onClick={()=>void organize('rename-tag',{id:renameId,name:renameName.trim()})}>名前を変更</Button></DialogContent></Dialog>
    <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="w-[calc(100vw-2rem)] max-w-none sm:max-w-[calc(100vw-4rem)]" aria-describedby={undefined}><DialogTitle className="sr-only">{active}</DialogTitle>{active&&<img src={imageUrl(active,boot.context)} alt={active} className="mx-auto max-h-[85dvh] max-w-full object-contain" />}</DialogContent></Dialog>
    <Dialog open={choosingFolder}><DialogContent showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onInteractOutside={e=>e.preventDefault()}><DialogTitle className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />フォルダー選択</DialogTitle><DialogDescription>フォルダーを選択してください…</DialogDescription></DialogContent></Dialog>
  </div>
}

