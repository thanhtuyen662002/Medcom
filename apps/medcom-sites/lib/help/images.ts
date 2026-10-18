import imageDimensions from "./image-dimensions.json";

const dimensions: Record<string, {width: number; height: number}> = imageDimensions;

export type HelpPicture = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

export type HelpPictures = Record<"desktop" | "mobile", HelpPicture>;

export function guideImages(name: string, alt: string, caption: string): HelpPictures {
  return {
    desktop: { src: `/help/images/${name}-desktop.webp`, alt: `${alt} — máy tính`, caption, ...(dimensions[`/help/images/${name}-desktop.webp`] ?? {width: 1440, height: 1000}) },
    mobile: { src: `/help/images/${name}-mobile.webp`, alt: `${alt} — điện thoại`, caption, ...(dimensions[`/help/images/${name}-mobile.webp`] ?? {width: 390, height: 844}) },
  };
}
