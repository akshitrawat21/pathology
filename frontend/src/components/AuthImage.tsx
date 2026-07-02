import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";

/** Loads an image from an authenticated endpoint via XHR (so the bearer token
 *  is sent) and renders it from an object URL. */
export default function AuthImage({
  path,
  className,
  alt,
  fallback,
}: {
  path: string; // relative to the API base, e.g. /slides/abc/thumbnail
  className?: string;
  alt?: string;
  fallback: ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setFailed(false);
    setUrl(null);
    api
      .get(path, { responseType: "blob" })
      .then((r) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(r.data);
        setUrl(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed || !url) return <>{fallback}</>;
  return <img src={url} className={className} alt={alt} />;
}
