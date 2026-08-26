import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MODELS, VIDEO_MODELS } from "./modelConfig.ts";

/**
 * The catalog is the single source of truth for every model the UI offers, and
 * nothing else validates it. A default that is not in its own options list, or
 * a model claiming image input without an input key, fails at generation time
 * for the user who picked it — never at build time.
 */

const RATIO = /^(\d+:\d+|auto|adaptive|custom)$/i;

test("image model ids are unique", () => {
  const ids = IMAGE_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in IMAGE_MODELS");
});

test("video model ids are unique", () => {
  const ids = VIDEO_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in VIDEO_MODELS");
});

test("image and video ids do not collide", () => {
  // The gallery keeps one `modelId` for both pickers, so a shared id would make
  // the mode switch ambiguous.
  const video = new Set(VIDEO_MODELS.map((m) => m.id));
  const clash = IMAGE_MODELS.filter((m) => video.has(m.id)).map((m) => m.id);
  assert.deepEqual(clash, [], "id used by both an image and a video model");
});

test("every image model is internally consistent", () => {
  for (const m of IMAGE_MODELS) {
    const where = `IMAGE_MODELS[${m.id}]`;

    assert.ok(m.id && m.apiId && m.name && m.provider, `${where}: missing identity field`);
    assert.ok(m.ratios.length > 0, `${where}: no aspect ratios`);
    for (const r of m.ratios) assert.match(r, RATIO, `${where}: bad ratio ${r}`);

    // maxImages drives the reference-image slot count in the composer.
    assert.equal(
      m.supportsImages,
      m.maxImages > 0,
      `${where}: supportsImages=${m.supportsImages} but maxImages=${m.maxImages}`,
    );

    assert.ok(m.apiInput.aspectRatioKey, `${where}: no aspectRatioKey`);
    assert.ok(
      (m.apiInput.promptMaxLength ?? 0) > 0,
      `${where}: promptMaxLength must be positive — the composer compares against it`,
    );

    if (m.supportsImages) {
      assert.ok(m.apiInput.imageInputKey, `${where}: accepts images but has no imageInputKey`);
    }
    if (m.supportsQuality) {
      assert.ok(m.apiInput.qualityKey, `${where}: supportsQuality but no qualityKey`);
      assert.ok(
        m.apiInput.qualityMap || m.apiInput.qualityOptions,
        `${where}: supportsQuality but no qualityMap or qualityOptions`,
      );
    }
    if (m.textOnlyApiId !== undefined) {
      assert.ok(
        typeof m.textOnlyApiId === "string" && m.textOnlyApiId.length > 0,
        `${where}: textOnlyApiId is present but empty`,
      );
      // textOnlyPromptMaxLength is optional — the composer falls back to
      // apiInput.promptMaxLength when it is absent.
    }
  }
});

test("every video model is internally consistent", () => {
  for (const m of VIDEO_MODELS) {
    const where = `VIDEO_MODELS[${m.id}]`;

    assert.ok(m.id && m.apiId && m.name && m.provider, `${where}: missing identity field`);
    // Empty ratios is legal: the model derives the ratio from its inputs and
    // both call sites hide the picker. The spellings only have to be parseable.
    for (const r of m.ratios) assert.match(r, RATIO, `${where}: bad ratio ${r}`);
    assert.ok(m.handles.length > 0, `${where}: no handles — nothing can connect to it`);
    assert.ok(
      (m.apiInput.promptMaxLength ?? 0) > 0,
      `${where}: promptMaxLength must be positive`,
    );
  }
});

test("every video default is one of its own options", () => {
  // This is the one that bites: the picker opens on the default, so a default
  // outside the list renders as an empty selection the user cannot restore.
  for (const m of VIDEO_MODELS) {
    const where = `VIDEO_MODELS[${m.id}]`;

    if (m.ratios.length > 0) {
      assert.ok(
        m.ratios.includes(m.defaultRatio),
        `${where}: defaultRatio ${m.defaultRatio} not in ratios`,
      );
    }

    if (m.durations.length > 0) {
      assert.ok(
        m.durations.includes(m.defaultDuration),
        `${where}: defaultDuration ${m.defaultDuration} not in durations`,
      );
    }
    if (m.resolutions && m.resolutions.length > 0) {
      assert.ok(
        m.resolutions.includes(m.defaultResolution!),
        `${where}: defaultResolution ${m.defaultResolution} not in resolutions`,
      );
    }
    if (m.modes && m.modes.length > 0) {
      assert.ok(
        m.modes.some((o) => o.value === m.defaultMode),
        `${where}: defaultMode ${m.defaultMode} is not one of ${m.modes.map((o) => o.value).join("/")}`,
      );
    }
  }
});

test("required handles are handles the model actually has", () => {
  for (const m of VIDEO_MODELS) {
    for (const h of m.requiredHandles ?? []) {
      assert.ok(
        m.handles.includes(h),
        `VIDEO_MODELS[${m.id}]: requires handle "${h}" that is not in handles`,
      );
    }
  }
});

test("duration bounds are not inverted", () => {
  for (const m of VIDEO_MODELS) {
    const { durationMin, durationMax } = m.apiInput as { durationMin?: number; durationMax?: number };
    if (durationMin != null && durationMax != null) {
      assert.ok(
        durationMin <= durationMax,
        `VIDEO_MODELS[${m.id}]: durationMin ${durationMin} > durationMax ${durationMax}`,
      );
    }
  }
});

test("the app's default image model exists", () => {
  // Hard-coded in the generate route, GenerateNode, PromptNode and NodePickerMenu.
  assert.ok(
    IMAGE_MODELS.some((m) => m.id === "nano-banana-2"),
    'the default "nano-banana-2" is referenced in four places and must stay in the catalog',
  );
});
