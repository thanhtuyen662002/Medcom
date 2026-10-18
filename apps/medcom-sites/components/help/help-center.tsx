"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { MedcomLogo } from "@/components/brand/medcom-logo";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, FileText, Info, List, Menu, Package, Search, ShoppingBag, Smartphone, Sparkles, Wrench, X, ZoomIn, ArrowRightLeft, CircleHelp, Sun, Moon } from "lucide-react";
import { defaultGuideId, findGuide, groupGuideIds, helpGroups, helpGuides, readyGuides, searchGuides, type HelpGuide } from "@/lib/help/guides";
import { useInheritedTheme } from "@/lib/help/use-inherited-theme";
import styles from "./help-center.module.css";
import { Monitor } from "lucide-react";
import type { HelpPicture, HelpPictures } from "@/lib/help/images";

const groupIcons = { shopping: ShoppingBag, package: Package, transfer: ArrowRightLeft, wrench: Wrench };

function FeatureBadge() { return <span className={styles.feature}>Feature</span>; }

const desktopViewport = () => window.matchMedia("(min-width: 1024px)").matches;
function subscribeViewport(listener: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function GuideFigure({ pictures, title, onZoom }: { pictures: HelpPictures; title: string; onZoom: (picture: HelpPicture) => void }) {
  const wide = useSyncExternalStore(subscribeViewport, desktopViewport, () => false);
  const [selected, setDevice] = useState<"desktop" | "mobile">();
  const device = selected ?? (wide ? "desktop" : "mobile");

  const picture = pictures[device];
  return <figure className={styles.figure}>
    <div className={styles.figureToolbar}>
      <div className={styles.devicePicker} role="group" aria-label={`Giao diện minh họa: ${title}`}>
        {(["desktop", "mobile"] as const).map(value => <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>
          {value === "desktop" ? <Monitor size={17} /> : <Smartphone size={17} />}<span>{value === "desktop" ? "Máy tính" : "Điện thoại"}</span>
        </button>)}
      </div>
      <button type="button" className={styles.zoomButton} onClick={() => onZoom(picture)} aria-label={`Phóng to ảnh: ${title}`}><ZoomIn size={18} /><span>Xem lớn</span></button>
    </div>
    <button type="button" className={styles.screenshotButton} onClick={() => onZoom(picture)} aria-label={`Mở ảnh ${device === "desktop" ? "máy tính" : "điện thoại"}: ${title}`}>
      <div className={styles.screenshotFrame} data-device={device}><Image unoptimized src={picture.src} alt={picture.alt} loading="lazy" width={picture.width} height={picture.height} /></div>
    </button>
    <figcaption>{picture.caption}</figcaption>
  </figure>;
}

function ImageDialog({ picture, onClose }: { picture: HelpPicture; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const zoomWidth = Math.max(660, picture.width);
  return <dialog ref={dialogRef} className={styles.imageDialog} onCancel={onClose} aria-label="Ảnh hướng dẫn phóng to" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><span>{picture.caption}</span><button type="button" onClick={onClose} aria-label="Đóng ảnh"><X size={22} /></button></header>
    <div className={styles.imageDialogBody}><div className={styles.imageDialogCanvas} style={enlarged ? { width: zoomWidth } : undefined}><Image unoptimized src={picture.src} alt={picture.alt} width={picture.width} height={picture.height} style={{ width: enlarged ? zoomWidth : "100%", maxWidth: enlarged ? "none" : picture.width, height: "auto" }} /></div></div>
    <div className={styles.imageTools}><button type="button" aria-pressed={enlarged} onClick={() => setEnlarged(value => !value)}><ZoomIn size={15} />{enlarged ? "Thu vừa màn hình" : "Phóng to để đọc rõ"}</button><span>{enlarged ? "Vuốt ngang / dọc để xem ảnh." : "Cuộn để xem toàn bộ ảnh."}</span></div>
  </dialog>;
}

export function HelpCenter({ initialGuideId = defaultGuideId }: { initialGuideId?: string }) {
  const { dark, toggleTheme } = useInheritedTheme();
  const [guideId, setGuideId] = useState(initialGuideId);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [zoom, setZoom] = useState<HelpPicture>();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const guide = findGuide(guideId) ?? helpGuides[0];
  const group = helpGroups.find(item => groupGuideIds(item).includes(guide.id))!;
  const subgroup = group.sections?.find(section => section.guides.includes(guide.id));
  const matches = searchGuides(query);
  const currentIndex = readyGuides.findIndex(item => item.id === guide.id);

  useEffect(() => {
    function syncLocation() {
      const id = new URLSearchParams(window.location.search).get("guide");
      setGuideId(id && findGuide(id) ? id : defaultGuideId);
      setTocOpen(false);
      setSearchOpen(false);
    }
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = menuDialog.current;
    const opener = menuButton.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; opener?.focus(); };
  }, [mobileOpen]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-130px 0px -55% 0px" });
    document.querySelectorAll("[data-help-section]").forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [guideId]);

  useEffect(() => {
    if (!window.location.hash) return;
    let id: string;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, [guideId]);

  useEffect(() => {
    function closeSearch(event: PointerEvent) { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); }
    document.addEventListener("pointerdown", closeSearch);
    return () => document.removeEventListener("pointerdown", closeSearch);
  }, []);

  function selectGuide(id: string) {
    setGuideId(id); setMobileOpen(false); setTocOpen(false); setQuery(""); setSearchOpen(false); setCopied(false); setCopyError(false); setActiveSection("");
    const next = new URL(window.location.href);
    next.searchParams.set("guide", id); next.hash = "";
    window.history.pushState(null, "", next);
    window.scrollTo({ top: 0, behavior: "instant" });
    window.setTimeout(() => document.getElementById("guide-title")?.focus({ preventScroll: true }), 0);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true); setCopyError(false);
      window.setTimeout(() => setCopied(false), 2200);
    } catch { setCopyError(true); }
  }

  function navContents() {
    function guideLink(id: string) {
      const entry = findGuide(id)!;
      return <a key={id} href={`?guide=${id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); selectGuide(id); }} className={`${styles.navItem} ${guide.id === id ? styles.navActive : ""}`} aria-current={guide.id === id ? "page" : undefined}>
        <span className={styles.navDot} /><span>{entry.title}</span>{entry.available ? guide.id === id && <ChevronRight size={15} /> : <FeatureBadge />}
      </a>;
    }
    return <>
      <div className={styles.navIntro}><span className={styles.eyebrow}>KHÁM PHÁ HƯỚNG DẪN</span><p>Chọn nghiệp vụ bạn cần</p></div>
      <nav aria-label="Danh mục hướng dẫn">
        {helpGroups.map((item, index) => {
          const Icon = groupIcons[item.icon];
          const expanded = item.id === group.id || index === 0;
          return <details key={item.id} open={expanded} className={styles.navGroup}>
            <summary><Icon size={17} /><span>{item.title}</span>{groupGuideIds(item).every(id => !findGuide(id)?.available) && <FeatureBadge />}<ChevronDown size={15} className={styles.groupChevron} /></summary>
            <div className={styles.navItems}>
              {item.sections?.map(section => <details key={section.id} open={section.id === subgroup?.id} className={styles.navSubgroup}>
                <summary><span>{section.title}</span>{section.guides.every(id => !findGuide(id)?.available) && <FeatureBadge />}<ChevronDown size={14} className={styles.groupChevron} /></summary>
                <div className={styles.navItems}>{section.guides.map(guideLink)}</div>
              </details>)}
              {item.guides.map(guideLink)}
            </div>
          </details>;
        })}
      </nav>
      <div className={styles.navNote}><BookOpen size={18} /><div><strong>{readyGuides.length} hướng dẫn sử dụng</strong><p>Ảnh máy tính và điện thoại.<br />Các mục Feature sẽ được bổ sung.</p></div></div>
      <Link href="/" className={styles.backApp}><ArrowUpRight size={17} /> Về ứng dụng Medcom</Link>
    </>;
  }

  function tocContents() {
    return <nav aria-label="Trong bài viết này" className={styles.tocLinks}>{guide.sections?.map((section, index) => <a key={section.id} href={`#${section.id}`} aria-current={activeSection === section.id ? "location" : undefined} onClick={() => { setActiveSection(section.id); setTocOpen(false); }}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}{!!guide.questions?.length && <a href="#cau-hoi" onClick={() => setTocOpen(false)}><CircleHelp size={15} />Câu hỏi thường gặp</a>}</nav>;
  }

  function themeButton(mobile = false) {
    const label = dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";
    return <button type="button" className={`${styles.themeToggle} ${mobile ? styles.mobileTheme : styles.desktopTheme}`} data-theme={dark ? "dark" : "light"} onClick={toggleTheme} aria-label={label} title={label}>
      <span className={styles.themeRail} aria-hidden="true">
        <span className={styles.themeThumb} />
        <span className={styles.themeSun}><Sun size={17} strokeWidth={1.8} /></span>
        <span className={styles.themeMoon}><Moon size={16} strokeWidth={1.8} /></span>
      </span>
    </button>;
  }

  return <div className={styles.shell}>
    <a href="#guide-content" className={styles.skipLink}>Đến nội dung hướng dẫn</a>
    <header className={styles.header}>
      <a href="/help" aria-label="Medcom — Trung tâm hướng dẫn" className={styles.brand}><MedcomLogo width={134} height={46} alt="MEDCOMTECH" priority /><span /><strong>Hướng dẫn</strong></a>
      <div ref={searchRef} className={styles.searchWrap} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); }}>
        <Search size={18} aria-hidden="true" /><input aria-label="Tìm hướng dẫn" placeholder="Bạn cần hướng dẫn gì?" value={query} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} aria-controls="help-search-results" autoComplete="off" />
        {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => { setQuery(""); setSearchOpen(false); }}><X size={16} /></button>}
        {searchOpen && query.trim() && <div id="help-search-results" className={styles.searchResults}>
          <p>{matches.length ? `${matches.length} hướng dẫn phù hợp` : "Chưa tìm thấy hướng dẫn"}</p>
          {matches.length ? matches.map(result => <a key={result.id} href={`?guide=${result.id}`} onClick={event => { event.preventDefault(); selectGuide(result.id); }}><FileText size={17} /><span><strong>{result.title}</strong><small>{result.available ? "Xem hướng dẫn từng bước" : "Nội dung sẽ được bổ sung"}</small></span>{!result.available && <FeatureBadge />}<ChevronRight size={16} /></a>) : <div className={styles.noResults}>Thử “tạo phiếu”, “duyệt” hoặc “đặt mua”. Bạn có thể tìm không dấu.</div>}
        </div>}
      </div>
      <div className={styles.headerActions}>{themeButton()}<Link href="/" className={styles.headerReturn}>Về ứng dụng <ArrowUpRight size={16} /></Link></div>
    </header>
    <div className={styles.mobileBar}>
      <button type="button" ref={menuButton} onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-label="Mở danh mục hướng dẫn"><Menu size={18} /><span>Danh mục hướng dẫn</span><ChevronDown size={14} /></button>
      {themeButton(true)}
    </div>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>{navContents()}</aside>
      <main id="guide-content" className={styles.main}>
        <div className={styles.breadcrumb}><span>Hướng dẫn</span><ChevronRight size={12} /><span>{group.title}</span>{subgroup && <><ChevronRight size={12} /><span>{subgroup.title}</span></>}</div>
        {guide.available ? <>
          <div className={styles.articleHeader}>
            <div className={styles.articleMeta}><span className={styles.readyBadge}><span /> Hướng dẫn sử dụng</span><span><Clock3 size={14} />{guide.minutes} phút đọc</span></div>
            <h1 id="guide-title" tabIndex={-1}>{guide.title}</h1>
            <p className={styles.description}>{guide.description}</p>
            <div className={styles.articleInfo}><span><Monitor size={16} /><Smartphone size={16} /> Máy tính và điện thoại</span><button type="button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Đã sao chép" : "Chia sẻ bài viết"}</button></div>
            <span role="status" className={styles.copyStatus}>{copyError ? "Chưa sao chép được. Bạn có thể sao chép đường dẫn trên thanh địa chỉ." : copied ? "Đã sao chép liên kết bài viết." : ""}</span>
          </div>
          <div className={styles.learnCard}><div className={styles.learnIcon}><BookOpen size={21} /></div><div><strong>Trong hướng dẫn này</strong><ul>{guide.summary?.map(item => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul><p>Dành cho: {guide.audience}</p></div></div>
          <details className={styles.mobileToc} open={tocOpen} onToggle={event => setTocOpen(event.currentTarget.open)}><summary><List size={17} /><span>Nội dung bài viết</span><ChevronDown size={16} /></summary>{tocContents()}</details>
          <div className={styles.photoNote}><Info size={15} /><p>Ảnh chụp giao diện với <strong>dữ liệu minh họa</strong>. Khung đỏ và số chỉ vị trí cần chú ý. Chạm ảnh để xem lớn.</p></div>
          <article className={styles.article}>{guide.sections?.map((section, index) => <section key={`${guide.id}-${section.id}`} id={section.id} data-help-section className={styles.section}>
            <div className={styles.sectionTitle}><span>{String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2></div>
            {section.intro && <p>{section.intro}</p>}
            {section.fields && <dl className={styles.fields}>{section.fields.map(field => <div key={field.name}><dt>{field.name}</dt><dd>{field.detail}</dd></div>)}</dl>}
            {section.steps && <ol className={styles.steps}>{section.steps.map((step, stepIndex) => <li key={step}><span>{stepIndex + 1}</span><p>{step}</p></li>)}</ol>}
            {section.images && <GuideFigure pictures={section.images} title={section.title} onZoom={setZoom} />}
            {section.tip && <div className={`${styles.callout} ${styles.tip}`}><Info size={18} /><div><strong>Mẹo thao tác</strong><p>{section.tip}</p></div></div>}
            {section.warning && <div className={`${styles.callout} ${styles.warning}`}><Info size={18} /><div><strong>Lưu ý trước khi tiếp tục</strong><p>{section.warning}</p></div></div>}
          </section>)}</article>
          {!!guide.questions?.length && <section id="cau-hoi" className={styles.faq}><div className={styles.sectionTitle}><CircleHelp size={24} /><h2>Câu hỏi thường gặp</h2></div>{guide.questions?.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={17} /></summary><p>{item.answer}</p></details>)}</section>}
          <div className={styles.articleFooter}><span><CheckCircle2 size={17} /> Bạn đã đến cuối hướng dẫn</span><a href="#guide-title"><ArrowUp size={15} /> Về đầu bài</a></div>
          <div className={styles.pagination}>{currentIndex > 0 ? <GuideLink guide={readyGuides[currentIndex - 1]} previous onSelect={selectGuide} /> : <span />}{currentIndex < readyGuides.length - 1 && <GuideLink guide={readyGuides[currentIndex + 1]} onSelect={selectGuide} />}</div>
        </> : <div className={styles.featurePage}><div className={styles.featureIcon}><BookOpen size={31} /><Sparkles size={18} /></div><FeatureBadge /><h1 id="guide-title" tabIndex={-1}>{guide.title}</h1><p>Hướng dẫn đang được chuẩn bị</p><span>Nội dung chi tiết và ảnh thao tác sẽ được bổ sung khi giao diện chức năng sẵn sàng. Bạn có thể xem các hướng dẫn đã hoàn thiện bên dưới.</span><div className={styles.readyCards}>{readyGuides.map(item => <a key={item.id} href={`?guide=${item.id}`} onClick={event => { event.preventDefault(); selectGuide(item.id); }}><FileText size={20} /><strong>{item.title}</strong><ArrowRight size={18} /></a>)}</div></div>}
        <footer className={styles.siteFooter}><span>MEDCOMTECH · Hướng dẫn sử dụng</span><span>Rõ từng bước. Dễ thực hiện.</span></footer>
      </main>
      {guide.available && <aside className={styles.toc}><span className={styles.eyebrow}>TRONG BÀI VIẾT NÀY</span>{tocContents()}</aside>}
    </div>
    {mobileOpen && <dialog ref={menuDialog} className={styles.menuDialog} aria-label="Danh mục hướng dẫn" onCancel={() => setMobileOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMobileOpen(false); }}><div className={styles.menuDialogHeader}><BookOpen size={20} /><strong>Danh mục hướng dẫn</strong><button type="button" onClick={() => setMobileOpen(false)} aria-label="Đóng danh mục"><X size={21} /></button></div><div className={styles.menuDialogContent}>{navContents()}</div></dialog>}
    {zoom && <ImageDialog picture={zoom} onClose={() => setZoom(undefined)} />}
  </div>;
}

function GuideLink({ guide, previous, onSelect }: { guide: HelpGuide; previous?: boolean; onSelect: (id: string) => void }) {
  return <a href={`?guide=${guide.id}`} onClick={event => { event.preventDefault(); onSelect(guide.id); }} className={previous ? styles.previousGuide : styles.nextGuide}><span>{previous ? <ArrowLeft size={15} /> : <BookOpen size={15} />}{previous ? "Bài trước" : "Đọc tiếp"}</span><strong>{guide.title}{!previous && <ArrowRight size={16} />}</strong></a>;
}
