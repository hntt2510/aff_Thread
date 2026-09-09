import type { PostMediaType } from "@/lib/posts/lifecycle";

export type MediaKind = "IMAGE" | "VIDEO";

export interface MediaItemInput {
  mediaKind: MediaKind;
  sourceUrl: string;
  altText?: string;
  position?: number;
}

export interface ValidatedPostMedia {
  mediaType: PostMediaType;
  items: MediaItemInput[];
}
