# Noomori Recipe Image Handling Specification

**Status:** MVP Source of Truth  
**Version:** 2.0  
**Scope:** One optional, durable recipe cover image.

Version 2.0 replaces the signed-upload workflow with authenticated client uploads protected by Supabase Storage Row Level Security (RLS). It also removes non-MVP image infrastructure and consolidates the lifecycle into one contract.

---

# 1. MVP Product Rule

Durable recipe-cover photo support is part of the MVP, but a cover photo is optional for each recipe.

```text
image_path = NULL
-> valid recipe without a cover image

image_path = "recipes/{owner_user_id}/{recipe_id}/{image_id}.webp"
-> valid recipe with a durable cover image
```

"Durable" means the selected photo is processed, uploaded to Supabase Storage, and associated with the recipe. A device-local picker URI is only draft state and MUST NOT be treated as persisted recipe data.

The UI MUST:

- allow a recipe to be saved without a photo;
- show the Noomori placeholder when no photo exists;
- persist a selected photo instead of silently discarding it;
- support replacement and removal; and
- keep the recipe usable when photo processing, upload, or cleanup fails.

---

# 2. Canonical Data Model

Recipe image bytes live in Supabase Storage. PostgreSQL stores only the active object path.

```sql
recipes.image_path text null
```

The database MUST NOT store:

- image bytes;
- base64 image data;
- device-local URIs;
- signed URLs; or
- other temporary delivery URLs.

For MVP, a recipe has zero or one cover image. A separate `recipe_images` table is not required.

The canonical object path is:

```text
recipes/{owner_user_id}/{recipe_id}/{image_id}.webp
```

Where:

- `owner_user_id` is derived from the authenticated session;
- `recipe_id` is returned by FastAPI after recipe creation; and
- `image_id` is a newly generated UUID for every upload.

Original filenames MUST NOT be used as object identity. Existing objects MUST NOT be overwritten. Replacement always uses a new `image_id` and therefore a new path.

---

# 3. Storage Security

Use one private Supabase Storage bucket:

```text
recipe-images
```

Configure the bucket with:

```text
public: false
allowed MIME type: image/webp
maximum file size: 5 MB
```

The authenticated mobile client uploads directly to this bucket. FastAPI does not issue signed upload permissions and does not proxy image bytes during MVP.

Storage RLS MUST enforce:

- authenticated access;
- the `recipe-images` bucket;
- the canonical path structure;
- `owner_user_id = auth.uid()` in the path;
- ownership of the referenced `recipe_id` for insertion;
- `image/webp` uploads;
- insert-only uploads with no overwrite; and
- deletion only by the storage-object owner.

Read policies MUST allow an object only when the requesting user may read its recipe through recipe ownership or the active household-sharing model.

RLS is the trust boundary. Client-generated path values are requests, not proof of ownership.

FastAPI Storage operations MUST use a request-scoped Storage client carrying the same verified user JWT. This keeps signing and cleanup subject to the same RLS rules as the caller instead of silently bypassing them.

---

# 4. Client Image Processing

The MVP requires selection from the photo library. Camera capture is deferred.

The picker SHOULD request the highest-quality available source so Noomori does not apply lossy compression twice. Immediately after selection, show the picker URI as the draft preview and asynchronously use the Expo SDK 56 ImageManipulator API to produce the persisted image while the editor remains usable.

Canonical output:

```text
format: WebP
MIME type: image/webp
maximum long edge: 1600 px
quality: approximately 0.8
aspect ratio: preserved
```

Processing rules:

1. Read the selected asset dimensions.
2. If its long edge exceeds 1600 pixels, resize that edge to 1600 and calculate the other dimension from the original aspect ratio.
3. Do not upscale smaller images.
4. Save the result as WebP at approximately 80% quality.
5. Read the processed file as an `ArrayBuffer` and reject it locally when it exceeds 5 MB.
6. Retain the prepared bytes only while the editor is mounted.
7. Upload the processed file bytes with `contentType: "image/webp"` and `upsert: false`.

Replacing or removing a selected image invalidates any older in-flight processing result. The client MAY use a local generation counter for this; it MUST NOT introduce a persistent job or cancellation system.

The processed output MUST render with the expected orientation. Do not add a custom EXIF-orientation subsystem unless physical-device testing demonstrates that ImageManipulator output is incorrect.

If processing or the bucket's size restriction rejects the image, show a clear error and leave the recipe's active image unchanged.

---

# 5. API Contract

Recipe creation and image-reference mutations continue to pass through FastAPI.

## Create Recipe

```http
POST /recipes
```

Recipe creation does not accept device-local photo data. A newly created recipe starts with:

```json
{
  "id": "R001",
  "image_path": null,
  "image_url": null
}
```

## Activate or Replace Cover Image

After a direct Storage upload succeeds:

```http
PUT /recipes/{recipe_id}/image
Content-Type: application/json
```

```json
{
  "image_path": "recipes/U001/R001/8a0971e2.webp"
}
```

Before persisting the path, FastAPI MUST verify:

- the caller owns the recipe;
- the path exactly matches the caller and route recipe;
- the object exists in `recipe-images`; and
- the object is an accepted WebP upload.

`recipes.image_path` changes only after these checks succeed.

## Remove Cover Image

```http
DELETE /recipes/{recipe_id}/image
```

FastAPI clears the active database reference and then attempts to delete the old Storage object.

## Recipe Responses

Authorized recipe list and detail responses expose:

```json
{
  "image_path": "recipes/U001/R001/8a0971e2.webp",
  "image_url": "https://...temporary-signed-url..."
}
```

Both values are `null` when the recipe has no image. `image_path` is stable identity; `image_url` is a temporary delivery credential.

---

# 6. Create and Replacement Flows

## Create With a Photo

```text
select photo
-> show its local preview immediately
-> process and validate it asynchronously while editing continues
-> await processing only if Save is tapped first
create recipe with image_path = NULL
-> generate a unique canonical path
-> upload directly under Storage RLS
-> PUT the uploaded image_path through FastAPI
-> return the updated recipe
```

If processing fails before creation, the save attempt stops and the UI shows a recovery message beside the photo field. The user may replace or remove the photo; removing it allows the recipe to be saved without a cover.

If upload fails after creation, the recipe remains valid with `image_path = NULL`. The UI reports that the recipe was saved without its photo and offers a photo-only retry. A retry MUST NOT create the recipe again.

If upload succeeds but FastAPI does not activate the path, the client performs best-effort deletion of the newly uploaded object. The recipe remains valid without that image.

## Replace a Photo

```text
current path: image-a.webp
-> process replacement
-> upload image-b.webp
-> FastAPI activates image-b.webp
-> UI receives the new path and cache identity
-> FastAPI deletes image-a.webp on a best-effort basis
```

The old object MUST NOT be deleted before the new object uploads and becomes active. Any failure before activation leaves the old image unchanged.

Every replacement receives a new path. Manual cache invalidation is not required.

---

# 7. Removal, Recipe Deletion, and Cleanup

Image removal uses this order:

```text
read old image_path
-> set image_path = NULL
-> delete old Storage object best-effort
```

Recipe deletion uses this order:

```text
read old image_path
-> delete recipe
-> delete old Storage object best-effort
```

A Storage deletion failure MUST NOT restore a cleared image reference or recreate a deleted recipe. Log the failure and leave the inaccessible object orphaned.

Scheduled orphan discovery and cleanup are not part of MVP. Add them only if observed orphan volume or storage cost justifies the job.

---

# 8. Delivery and Caching

FastAPI generates signed download URLs only after authorizing access to the recipe. Signed URLs MUST NOT be stored in PostgreSQL.

MVP defaults:

```text
signed URL lifetime: 60 minutes
recipe-query freshness interval: no more than 45 minutes
```

If a non-null remote image fails to load, invalidate and refetch the recipe once to obtain a fresh signed URL. If the retry also fails, show the placeholder and normal error treatment. Do not create an independent signed-URL refresh service.

Render remote recipe images with Expo Image:

```tsx
<Image
  source={{
    uri: recipe.image_url,
    cacheKey: recipe.image_path,
  }}
  cachePolicy="memory-disk"
  contentFit="cover"
/>
```

The application model must therefore expose both `image_path` and `image_url` even if the UI maps them to camel-case names.

`image_path` is the stable cache identity. A changing signed URL does not create a new image identity, while a replacement path does.

Noomori MUST NOT implement a custom image loader, memory cache, disk cache, LRU, decoder, bitmap pool, or request queue.

When `image_path` is `NULL`, the API MUST NOT generate an image URL and the UI MUST render the approved Noomori placeholder without making an image request.

---

# 9. Required Failure Semantics

| Failure | Required result |
|---|---|
| Recipe creation fails | No upload is attempted. |
| Processing fails before creation | Stop that save attempt; show an inline photo error and do not create or upload. |
| Upload fails | `image_path` is unchanged. |
| New object uploads but activation fails | `image_path` is unchanged; delete the new object best-effort. |
| Replacement succeeds but old-object deletion fails | New image remains active; log the orphan. |
| Removal succeeds but object deletion fails | Recipe remains image-free; log the orphan. |
| Recipe deletion succeeds but object deletion fails | Recipe remains deleted; log the orphan. |
| Signed URL expires or a non-null remote image fails | Refetch the recipe once; then show the fallback if it still fails. |
| User is unauthorized | Do not upload, activate, sign, read, replace, remove, or delete the image. |

Cache contents are never recipe data. Cache loss only causes the authorized image to be fetched again.

---

# 10. MVP Acceptance Scenarios

The image feature is complete when all of these scenarios pass:

1. Create and use a recipe without a photo.
2. Select JPEG, PNG, and HEIC inputs and persist a correctly oriented WebP.
3. Resize images larger than 1600 pixels without changing aspect ratio.
4. Avoid upscaling smaller images.
5. Reject oversized or non-WebP Storage uploads.
6. Prevent one user from uploading into another user's path or recipe.
7. Allow an authorized owner or household member to view the image.
8. Prevent an unauthorized user from receiving a signed image URL.
9. Keep `image_path` unchanged after processing, upload, or activation failure.
10. Replace an image with a new path without briefly deleting the working image.
11. Remove an image while preserving the recipe.
12. Delete a recipe even when Storage cleanup fails.
13. Reuse the cached image when signed URLs rotate but `image_path` does not.
14. Refetch once when a signed URL expires.
15. Render the approved placeholder without an image request when `image_path` is `NULL`.

Cross-platform verification MUST include physical iOS and Android devices for picker output, orientation, WebP encoding, upload, and rendering. Web behavior MUST also be checked if the web app exposes recipe creation in MVP.

---

# 11. Explicit Non-Goals

MVP does not include:

- camera capture;
- multiple recipe photos or galleries;
- instruction-step images;
- image captions or ordering;
- original-file preservation;
- thumbnail or responsive variants;
- server-side image processing;
- binary proxying through FastAPI;
- signed upload permissions;
- custom CDN or cache infrastructure;
- prefetching;
- offline-first media;
- background transcoding;
- an image metadata table;
- AI image processing; or
- scheduled orphan cleanup.

Add any of these only in response to a concrete product requirement or measured problem.

---

# 12. Core Invariants

1. A recipe has zero or one cover image.
2. A recipe without an image is fully valid.
3. Image bytes live in the private `recipe-images` bucket.
4. PostgreSQL stores only the active `image_path`.
5. Every upload uses a new canonical WebP path.
6. The authenticated client uploads directly under Storage RLS.
7. FastAPI persists image references and authorizes signed delivery.
8. The active path changes only after the new object exists and is verified.
9. Cleanup is ordered after the authoritative database change and is best-effort.
10. `image_path` is stable identity; `image_url` is temporary location.
11. Expo Image owns loading, decoding, rendering, and memory/disk caching.
12. No custom media infrastructure is introduced for MVP.
