# Ready-made parts (app sites: e-commerce, booking, restaurant)

App sites run the factory's tested code. You design and place the parts; you never write their code.

## What you must not do

- Never write or edit anything under `app/`, `js/sf-parts.js`, or a page at `admin/`, `api/` or `media/`. The factory installs and replaces these files. The Worker answers `/admin`, `/api/*` and `/media/*` before any page.
- Never invent catalogue entries as page text. Products, services and menu items live in the client's admin screen; the page shows whatever is there.
- No payment, cart or booking code. Those parts arrive as factory parts in later versions.

## Catalogue (products, services, menu)

Load the script once per page that uses a part: `<script src="/js/sf-parts.js" defer></script>`.

```html
<section data-sf-catalog data-category="tatlilar" data-limit="6">
  <div class="filters">                         <!-- optional -->
    <button type="button" data-sf-filter="">Tümü</button>
    <button type="button" data-sf-filter="tatlilar">Tatlılar</button>
  </div>
  <template data-sf-item data-list-class="menu-grid">
    <article class="menu-card">
      <img data-field="image" alt="">
      <h3 data-field="name"></h3>
      <p data-field="description"></p>
      <span data-field="price"></span>  <span data-field="duration"></span>  <small data-field="category"></small>
    </article>
  </template>
  <p data-sf-empty hidden>Menü yakında burada.</p>
</section>
```

- You design the `<template>` freely. Fields: `name`, `description`, `price` (formatted for the page language), `image`, `category`, `duration` (services, in minutes). An empty field hides itself; an item without an image drops its `<img>`.
- The rendered items go into one wrapper `<div>` after the template. `data-list-class` sets that wrapper's class, so it is your grid.
- `data-category` (a category slug) and `data-limit` are optional. Filter buttons get `aria-pressed`; style `[aria-pressed="true"]`.
- Always write the empty state (`data-sf-empty`) in the page language. It also shows when the catalogue cannot load.
- Style the loading moment with CSS, e.g. a min-height on the wrapper. No skeleton scripts.

## Contact and enquiry forms (inbox)

```html
<form data-sf-inquiry data-sent="Teşekkürler, size döneceğiz." data-error="Gönderilemedi, lütfen arayın.">
  <label>Adınız <input name="name" required maxlength="120" autocomplete="name"></label>
  <label>Telefon veya e-posta <input name="contact" required maxlength="160"></label>
  <label>Konu <input name="subject" maxlength="160"></label>            <!-- optional -->
  <label>Mesajınız <textarea name="message" maxlength="4000"></textarea></label>
  <button type="submit">Gönder</button>
  <p data-sf-status role="status"></p>
</form>
```

- Use only these field names: `name`, `contact`, `subject`, `message`. Write `data-sent` and `data-error` in the page language.
- Do not add an `action` attribute: the script sends the form.
- The form gets `data-state="sent"` or `data-state="error"`; style those states.
- Keep the phone, e-mail and WhatsApp buttons next to the form.
- New messages appear in the client's admin screen, and in the notification address if Eren set one.

## The admin screen

The client manages the catalogue and messages at `/admin`, with a password Eren sets in the panel. Do not link to it from the public pages. Do not mention it in page text.
