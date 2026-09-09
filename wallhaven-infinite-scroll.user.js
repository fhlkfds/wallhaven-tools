// ==UserScript==
// @name         Wallhaven SFW infinite scroll
// @namespace    https://github.com/fhlkfds/wallhaven-tools
// @version      1.0.0
// @description  Load the next SFW Wallhaven result page near the bottom of a listing.
// @match        https://wallhaven.cc/search?*
// @match        https://wallhaven.cc/search*
// @match        https://wallhaven.cc/latest
// @match        https://wallhaven.cc/latest?*
// @match        https://wallhaven.cc/hot
// @match        https://wallhaven.cc/hot?*
// @match        https://wallhaven.cc/toplist
// @match        https://wallhaven.cc/toplist?*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const API_PATH = "/api/v1/search";
  const grid = document.querySelector(".thumb-listing-page > ul");
  if (!grid) return;

  const initialPage = positiveInteger(new URL(location.href).searchParams.get("page")) || 1;
  const loadedPages = new Set([initialPage]);
  const loadedIds = new Set(
    [...grid.querySelectorAll("figure.thumb[data-wallpaper-id]")]
      .map((card) => card.dataset.wallpaperId)
      .filter(Boolean),
  );

  let nextPage = initialPage + 1;
  let lastPage = Infinity;
  let inFlight = false;
  let randomSeed = "";

  const status = document.createElement("div");
  status.id = "wallhaven-infinite-scroll-status";
  Object.assign(status.style, {
    boxSizing: "border-box",
    margin: "1rem auto 2rem",
    padding: "0.65rem 1rem",
    width: "fit-content",
    borderRadius: "4px",
    background: "rgba(27, 30, 34, 0.92)",
    color: "#ddd",
    font: "600 13px/1.4 sans-serif",
    textAlign: "center",
  });
  status.textContent = "Scroll for more results";
  grid.closest(".thumb-listing-page").append(status);

  function positiveInteger(value) {
    const number = Number.parseInt(value || "", 10);
    return Number.isInteger(number) && number > 0 ? number : 0;
  }

  function apiParams(page) {
    const params = new URL(location.href).searchParams;
    params.delete("apikey");
    params.delete("api_key");
    params.set("purity", "100");
    params.set("page", String(page));

    const route = location.pathname.replace(/\/+$/, "") || "/";
    if (!params.has("sorting")) {
      if (route === "/search") params.set("sorting", "relevance");
      if (route === "/latest") params.set("sorting", "date_added");
      if (route === "/hot") params.set("sorting", "hot");
      if (route === "/toplist") params.set("sorting", "toplist");
    }
    if (["/latest", "/hot", "/toplist"].includes(route) && !params.has("order")) {
      params.set("order", "desc");
    }
    if (route === "/toplist" && !params.has("topRange")) {
      params.set("topRange", "1M");
    }
    if (randomSeed && !params.has("seed")) params.set("seed", randomSeed);

    return params;
  }

  function makeCard(item) {
    if (item.purity !== "sfw" || loadedIds.has(item.id)) return null;

    const li = document.createElement("li");
    const figure = document.createElement("figure");
    const category = /^[a-z]+$/i.test(item.category || "") ? item.category : "general";
    const width = 300;
    const height = item.dimension_x > 0
      ? Math.max(100, Math.round((width * item.dimension_y) / item.dimension_x))
      : 200;

    figure.className = `thumb thumb-${item.id} thumb-sfw thumb-${category}`;
    figure.dataset.wallpaperId = item.id;
    figure.style.width = `${width}px`;
    figure.style.height = `${height}px`;

    const image = document.createElement("img");
    image.className = "lazyload";
    image.src = item.thumbs?.small || item.thumbs?.large;
    image.alt = `${item.resolution} SFW wallpaper`;
    image.loading = "lazy";

    const preview = document.createElement("a");
    preview.className = "preview";
    preview.href = item.url || `https://wallhaven.cc/w/${item.id}`;
    preview.target = "_blank";
    preview.rel = "noopener";

    const info = document.createElement("div");
    info.className = "thumb-info";
    const resolution = document.createElement("span");
    resolution.className = "wall-res";
    resolution.textContent = String(item.resolution || "").replace("x", " x ");
    info.append(resolution);

    figure.append(image, preview, info);
    li.append(figure);
    loadedIds.add(item.id);
    return li;
  }

  function finish(message = "No more results") {
    lastPage = Math.min(lastPage, nextPage - 1);
    status.textContent = message;
    observer.disconnect();
  }

  async function loadNextPage() {
    if (inFlight || loadedPages.has(nextPage) || nextPage > lastPage) return;

    const page = nextPage;
    inFlight = true;
    status.textContent = `Loading page ${page}...`;

    try {
      const response = await fetch(`${API_PATH}?${apiParams(page)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      if (!Array.isArray(payload.data) || !payload.meta) {
        throw new Error("unexpected API response");
      }
      if (payload.data.some((item) => item.purity !== "sfw")) {
        throw new Error("API returned a non-SFW result");
      }

      const fragment = document.createDocumentFragment();
      let added = 0;
      for (const item of payload.data) {
        const card = makeCard(item);
        if (!card) continue;
        fragment.append(card);
        added += 1;
      }
      grid.append(fragment);

      loadedPages.add(page);
      nextPage = page + 1;
      lastPage = positiveInteger(payload.meta.last_page) || page;
      if (payload.meta.seed) randomSeed = payload.meta.seed;

      if (page >= lastPage || payload.data.length === 0) {
        finish();
      } else {
        status.textContent = `Loaded page ${page} (${added} new results)`;
      }
    } catch (error) {
      console.error("Wallhaven infinite scroll:", error);
      status.textContent = `Page ${page} failed (${error.message}). Click to retry.`;
    } finally {
      inFlight = false;
    }
  }

  status.addEventListener("click", () => loadNextPage());

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
    },
    { rootMargin: "1200px 0px" },
  );
  observer.observe(status);
})();
