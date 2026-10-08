import { useEffect } from "react";

const SITE = "doo-wops!";

// Sets the browser tab title for the current screen, e.g. "start a 1v1 | doo-wops!".
// Pass null to leave whatever a child screen has set.
export default function usePageTitle(title) {
  useEffect(() => {
    if (title == null) return;
    document.title = title ? `${title} | ${SITE}` : SITE;
  }, [title]);
}
