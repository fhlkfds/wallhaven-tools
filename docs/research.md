# Wallhaven discovery notes

Checked against Wallhaven's live SFW endpoints on 2026-09-08. Every API request in this pass explicitly used `purity=100`; no API key was sent.

## Public search API

Wallhaven documents the listing endpoint as `GET https://wallhaven.cc/api/v1/search`. Keyless requests can retrieve SFW results. The documented limit is 45 API calls per minute, with HTTP 429 after the limit is reached. Search listings have at most 24 entries per response and include pagination metadata. [Official API v1 documentation](https://wallhaven.cc/help/api)

This request was used for the field check:

```text
curl --fail --location --silent --show-error \
  'https://wallhaven.cc/api/v1/search?q=nature&purity=100&page=1'
```

The live response had this shape (the values below are from the first item, trimmed only to the fields these tools need):

```json
{
  "data": [
    {
      "id": "6lekl7",
      "url": "https://wallhaven.cc/w/6lekl7",
      "purity": "sfw",
      "category": "anime",
      "dimension_x": 3840,
      "dimension_y": 2160,
      "resolution": "3840x2160",
      "path": "https://w.wallhaven.cc/full/6l/wallhaven-6lekl7.png",
      "thumbs": {
        "large": "https://th.wallhaven.cc/lg/6l/6lekl7.jpg",
        "original": "https://th.wallhaven.cc/orig/6l/6lekl7.jpg",
        "small": "https://th.wallhaven.cc/small/6l/6lekl7.jpg"
      }
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 3048,
    "per_page": 24,
    "total": 73130,
    "query": "nature",
    "seed": null
  }
}
```

Source: [the live SFW search response](https://wallhaven.cc/api/v1/search?q=nature&purity=100&page=1). The parsed fields are strings except `dimension_x` and `dimension_y`, which are numbers; `thumbs` is an object. The complete item also currently includes `short_url`, `views`, `favorites`, `source`, `ratio`, `file_size`, `file_type`, `created_at`, and `colors`.

The response headers exposed `x-ratelimit-limit: 45` and `x-ratelimit-remaining`. The official documentation says a limit breach returns 429. It does not promise a `Retry-After` header, so the CLI should keep its own bounded exponential-backoff schedule. [Official API rate-limit section](https://wallhaven.cc/help/api#limits)

### Parameters and route mappings

The official search table accepts `q`, `categories`, `purity`, `sorting`, `order`, `topRange`, `atleast`, `resolutions`, `ratios`, `colors`, `page`, and `seed`. It documents `categories` and `purity` as three-character bit fields, comma-separated values for `resolutions` and `ratios`, and a six-character alphanumeric `seed` for stable random pagination. [Official search parameter table](https://wallhaven.cc/help/api#search)

Always replace any incoming `purity` value with `100`; do not merely add a second `purity` parameter. No API-key parameter or header is needed for this project.

Live HTML/API comparisons produced these route defaults:

| Browser route | API parameters to add when absent | Evidence |
| --- | --- | --- |
| `/search` | `sorting=relevance` | The first eight IDs on `/search?q=nature&purity=100` matched the API only when `sorting=relevance` was explicit. The bare API defaults to `date_added`. |
| `/latest` | `sorting=date_added&order=desc` | The first five HTML result IDs matched the API result IDs. |
| `/hot` | `sorting=hot&order=desc` | The first five HTML result IDs matched the API result IDs. `hot` works on the live API although the current help table omits it from the allowed sorting values. |
| `/toplist` | `sorting=toplist&order=desc&topRange=1M` | The first five HTML result IDs matched the API result IDs. `1M` is the documented default range. |

Keep explicit URL parameters from the browser URL, then apply only the missing route defaults, set the next `page`, and force `purity=100`. For random sorting, carry `meta.seed` into later API calls, as Wallhaven says this prevents repeats between pages. [Official API v1 documentation](https://wallhaven.cc/help/api#search)

The HTML has `<meta name="max-pages" content="100">`, but the API accepted page 101 and returned 24 SFW items while reporting page 101 of 3048. The API metadata is therefore the useful pagination boundary for injected results, not the HTML cap. A separate live check found 23 items on page 2 while `meta.last_page` remained 3048 and page 3 again had 24. A short page is not reliable proof of the final page; `meta.current_page >= meta.last_page` or an empty `data` array is safer. This observation conflicts with the requested CLI rule to stop on fewer than 24 results and should be called out in implementation notes.

## Live result-page DOM

The four pages have the same result container:

```html
<section class="thumb-listing-page">
  <ul>
    <li>
      <figure class="thumb thumb-zxqkdy thumb-sfw thumb-general"
              data-wallpaper-id="zxqkdy"
              style="width:300px;height:200px">
        <img alt="loading" class="lazyload"
             data-src="https://th.wallhaven.cc/small/zx/zxqkdy.jpg" src="">
        <a class="preview" href="https://wallhaven.cc/w/zxqkdy" target="_blank"></a>
        <div class="thumb-info">
          <span class="wall-res">1920 x 1280</span>
          <!-- favorite and tag controls follow on server-rendered cards -->
        </div>
      </figure>
    </li>
  </ul>
</section>
```

Sources: live [search](https://wallhaven.cc/search?q=nature&purity=100), [latest](https://wallhaven.cc/latest?purity=100), [hot](https://wallhaven.cc/hot?purity=100), and [toplist](https://wallhaven.cc/toplist?purity=100) pages.

The reusable selectors are `.thumb-listing-page > ul` for insertion and `figure.thumb[data-wallpaper-id]` for cards. Each card adds `thumb-{id}`, `thumb-{purity}`, and `thumb-{category}` classes. A minimal injected card needs the wrapping `li`, the `figure` classes and ID, a thumbnail image, `.preview`, and `.thumb-info > .wall-res`. The favorite and tag controls point at authenticated/site-only actions and are not derivable from the listing response, so cloned controls would be misleading.

The server puts the thumbnail URL in `img[data-src]` and leaves `src` empty for its lazy loader. A userscript cannot assume that Wallhaven's existing lazy-load observer will register nodes inserted later. Setting `src` directly to `thumbs.small` while retaining the site's structural classes avoids that dependency.

Each page also renders `ul.pagination[data-pagination]` and an `a.next[rel="next"]`. The API's `meta.current_page` and `meta.last_page` are still better for termination because injected pages do not update Wallhaven's server-rendered pagination widget.

## Browser fetch feasibility

The userscript runs on `https://wallhaven.cc/*` and calls `https://wallhaven.cc/api/v1/search`, so the request is same-origin. A normal `fetch()` is sufficient; no userscript cross-origin grant is needed. The live API response did not include `Access-Control-Allow-Origin`, which would matter only if the script ran on another origin. The page did not send a `Content-Security-Policy` header during this check.

Thumbnail and full-image URLs use Wallhaven subdomains (`th.wallhaven.cc` and `w.wallhaven.cc`). Loading a cross-origin image in an `<img>` is allowed here because the script does not read its pixels.
