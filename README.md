# wallhaven-tools

Two small SFW-only tools for Wallhaven:

- `wallhaven-infinite-scroll.user.js` adds automatic pagination to Wallhaven
  search, latest, hot, and toplist pages.
- `wallhaven-dl` downloads full-size results from the public search API.

Neither tool accepts an API key. Both force Wallhaven's `purity=100` filter.

## Requirements

The downloader needs Bash 4 or newer, `curl`, and `jq`. On Arch Linux:

```sh
sudo pacman -S --needed bash curl jq
```

## Install the userscript

1. Install Tampermonkey or Violentmonkey in your browser.
2. Open the extension's dashboard and create a new script.
3. Replace the editor contents with
   `wallhaven-infinite-scroll.user.js`, then save it.
4. Open an SFW Wallhaven listing such as
   `https://wallhaven.cc/search?q=nature&purity=100`.

The script watches a marker below the result grid. When that marker approaches
the viewport, it requests the next page from Wallhaven's same-origin public API
and appends cards using the site's current thumbnail classes. It stops at the
API's last page. Any incoming purity setting is replaced with `100`.

### Manual browser test

- Open `/search?q=nature`, `/latest`, `/hot`, and `/toplist` one at a time.
- In Developer Tools, filter the Network panel for `/api/v1/search`.
- Scroll toward the bottom and confirm page 2 is requested once.
- Confirm new thumbnails appear in the existing grid and open their wallpaper
  pages in a new tab.
- Scroll through another boundary and confirm each page number appears once.
- Confirm the bottom status changes to `No more results` on a one-page query.
- Simulate an offline request and confirm the status offers a click-to-retry.
- Inspect each API request and confirm `purity=100` is present.

Browser behavior has to be checked manually. Static JavaScript syntax and the
live API/DOM assumptions can be tested outside the extension, but extension
injection and scrolling require a browser session.

## Install the downloader

Make the script executable, then link it into your user path:

```sh
chmod +x ~/Projects/wallhaven-tools/wallhaven-dl
mkdir -p ~/.local/bin
ln -s ~/Projects/wallhaven-tools/wallhaven-dl ~/.local/bin/wallhaven-dl
```

If that link already exists and points elsewhere, inspect and remove it before
running `ln -s`.

## Downloader usage

```text
wallhaven-dl -q QUERY [-o DIR] [--res RESOLUTION] [--atleast RESOLUTION]
             [--page-limit N] [--param KEY=VALUE ...]
wallhaven-dl WALLHAVEN_SEARCH_URL [-o DIR] [--page-limit N]
```

Examples:

```sh
wallhaven-dl -q "misty forest"
wallhaven-dl -q nature --res 1920x1080 --page-limit 2
wallhaven-dl -q mountains --atleast 1080p --param ratios=16x9,16x10
wallhaven-dl --param sorting=toplist --param topRange=1w -q landscape
wallhaven-dl 'https://wallhaven.cc/search?q=arch+linux&categories=110'
wallhaven-dl 'https://wallhaven.cc/hot' -o ~/Pictures/wallpapers/hot
```

The default output directory is
`~/Pictures/wallpapers/wallhaven/`. Existing files are skipped, which makes a
second run safe. Files are first downloaded to a temporary directory and moved
into place only after `curl` succeeds.

`--param KEY=VALUE` passes another public search parameter through to the API.
Useful keys include `categories`, `sorting`, `order`, `topRange`, `resolutions`,
`ratios`, and `colors`. The script rejects `apikey`, `api_key`, `purity`, and
`page`; it owns those values so requests remain keyless and SFW-only.

## Rate limiting and pagination

Wallhaven documents a limit of 45 API requests per minute. The downloader waits
two seconds between API pages and 0.25 seconds between image downloads. On HTTP
429 it waits 30 seconds, then 60, then 120, and stops after the third retry.
`curl` also gets two retries for transient transfer failures.

The API currently reports 24 entries per page, but a live check returned 23 on
page 2 and 24 on page 3 for the same query. Because a short page is not a safe
end marker, the downloader follows `meta.last_page`; it also stops on an empty
page. `--page-limit N` always stops after page N.

Research notes and the response/DOM fields used by the tools are recorded in
[`docs/research.md`](docs/research.md).
