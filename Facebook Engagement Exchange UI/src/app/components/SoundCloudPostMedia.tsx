import { useEffect, useState } from "react";
import { ImageIcon, Play } from "lucide-react";
import { api } from "../services/api";

type Props = {
  postUrl: string;
  className?: string;
};

/**
 * Loads Open Graph preview (image / video thumbnail) for a post URL via the API proxy.
 */
export function SoundCloudPostMedia({ postUrl, className = "" }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImageUrl(null);
    setImgFailed(false);
    setIsVideo(false);

    api
      .getSoundCloudPostPreview(postUrl)
      .then((r) => {
        if (!cancelled) {
          setImageUrl(r.imageUrl);
          setIsVideo(Boolean(r.isVideo));
        }
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postUrl]);

  const showImage = Boolean(imageUrl && !imgFailed);
  const boxClass = `group relative block overflow-hidden rounded-xl border border-border bg-muted/40 no-underline transition-colors hover:bg-muted/55 aspect-[16/9] ${className}`;

  return (
    <a href={postUrl} target="_blank" rel="noreferrer" className={boxClass}>
      {loading ? (
        <div className="flex h-full w-full animate-pulse flex-col items-center justify-center bg-muted/60">
          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      ) : showImage ? (
        <>
          <img
            src={imageUrl!}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
          {isVideo ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white shadow-lg">
                <Play className="h-7 w-7 fill-current pl-1" />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
            Preview unavailable - open post
          </span>
        </div>
      )}
    </a>
  );
}
