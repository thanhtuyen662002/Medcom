"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { BookOpen, CheckCircle2, ChevronDown, CircleHelp, Info, Monitor, Smartphone, X, ZoomIn } from "lucide-react";
import { findGuide } from "@/lib/help/guides";
import type { HelpPicture, HelpPictures } from "@/lib/help/images";
import styles from "./help-center.module.css";

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
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    // The help sheet (Radix) closes on Escape from a document capture listener; take Escape first so it
    // closes only the enlarged image.
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); } };
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("keydown", escape, true); dialog?.close(); previous?.focus(); };
  }, []);
  const zoomWidth = Math.max(660, picture.width);
  return <dialog ref={dialogRef} className={styles.imageDialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-label="Ảnh hướng dẫn phóng to" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><span>{picture.caption}</span><button type="button" onClick={onClose} aria-label="Đóng ảnh"><X size={22} /></button></header>
    <div className={styles.imageDialogBody}><div className={styles.imageDialogCanvas} style={enlarged ? { width: zoomWidth } : undefined}><Image unoptimized src={picture.src} alt={picture.alt} width={picture.width} height={picture.height} style={{ width: enlarged ? zoomWidth : "100%", maxWidth: enlarged ? "none" : picture.width, height: "auto" }} /></div></div>
    <div className={styles.imageTools}><button type="button" aria-pressed={enlarged} onClick={() => setEnlarged(value => !value)}><ZoomIn size={15} />{enlarged ? "Thu vừa màn hình" : "Phóng to để đọc rõ"}</button><span>{enlarged ? "Vuốt ngang / dọc để xem ảnh." : "Cuộn để xem toàn bộ ảnh."}</span></div>
  </dialog>;
}

/** One guide, embedded in the screen it explains: summary, numbered steps with screenshots, FAQ. */
export function GuideArticle({ guideId }: { guideId: string }) {
  const [zoom, setZoom] = useState<HelpPicture>();
  const guide = findGuide(guideId);
  if (!guide?.available) return null;
  return <div className={`${styles.shell} ${styles.embedded}`}>
    <div className={styles.learnCard}><div className={styles.learnIcon}><BookOpen size={21} /></div><div><strong>Trong hướng dẫn này</strong><ul>{guide.summary?.map(item => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul><p>Dành cho: {guide.audience}</p></div></div>
    {/* Text-only guides (warehouse, transfer, equipment) carry no screenshots to explain. */}
    {guide.sections?.some(section => section.images) && <div className={styles.photoNote}><Info size={15} /><p>Ảnh chụp giao diện với <strong>dữ liệu minh họa</strong>. Khung đỏ và số chỉ vị trí cần chú ý. Chạm ảnh để xem lớn.</p></div>}
    <article className={styles.article}>{guide.sections?.map((section, index) => <section key={section.id} className={styles.section}>
      <div className={styles.sectionTitle}><span>{String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2></div>
      {section.intro && <p>{section.intro}</p>}
      {section.fields && <dl className={styles.fields}>{section.fields.map(field => <div key={field.name}><dt>{field.name}</dt><dd>{field.detail}</dd></div>)}</dl>}
      {section.steps && <ol className={styles.steps}>{section.steps.map((step, stepIndex) => <li key={step}><span>{stepIndex + 1}</span><p>{step}</p></li>)}</ol>}
      {section.images && <GuideFigure pictures={section.images} title={section.title} onZoom={setZoom} />}
      {section.tip && <div className={`${styles.callout} ${styles.tip}`}><Info size={18} /><div><strong>Mẹo thao tác</strong><p>{section.tip}</p></div></div>}
      {section.warning && <div className={`${styles.callout} ${styles.warning}`}><Info size={18} /><div><strong>Lưu ý trước khi tiếp tục</strong><p>{section.warning}</p></div></div>}
    </section>)}</article>
    {!!guide.questions?.length && <section className={styles.faq}><div className={styles.sectionTitle}><CircleHelp size={24} /><h2>Câu hỏi thường gặp</h2></div>{guide.questions.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={17} /></summary><p>{item.answer}</p></details>)}</section>}
    {zoom && <ImageDialog picture={zoom} onClose={() => setZoom(undefined)} />}
  </div>;
}
