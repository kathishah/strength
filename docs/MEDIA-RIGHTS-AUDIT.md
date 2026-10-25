# Exercise media rights audit

**Status:** No third-party source is cleared for the public demo or a distributable image pack. The default distribution will use local placeholders. Revisit this audit before adding any image or animation to a downloadable pack or public showcase build.

## Original art in the demo

The public demo uses a separate, original set: animated GIFs of anatomical figures with the worked muscles in red, created by the repository owner for this project and released under the repository's MIT license. They are in `demo/media/<exercise id>.gif` (listed in `DEMO_MEDIA` in `demo/media.js`), are not derived from any file in the inventory below, and are not part of the app's deploy. The 58 third-party images below stay uncleared and stay out of the demo.

Per-file record: every file in `demo/media/` (18 exercises): creator is the repository owner; license is MIT with the repository; no attribution required.

## Inventory

`scripts/image-sources.json` lists 58 third-party image URLs across six source domains:

| Source | Count | Finding | Default disposition |
|---|---:|---|---|
| StrengthLog | 40 | Its published app terms say content is owned or licensed by StrengthLog, grant personal-use access, and restrict reproduction or integration into other software without prior written authorization. The terms are app-specific, so they do not establish the license for each website GIF; no redistribution license for these GIFs was found. | Not cleared; written permission or replacement required. |
| Truman State Campus Recreation | 7 | The pages publish exercise GIFs for campus recreation use. The pages checked did not state a license granting redistribution in another app or image pack. | Not cleared; written permission or replacement required. |
| Spotebi | 6 | No public redistribution license for the listed exercise illustrations was located in the pages checked. | Not cleared; written permission or replacement required. |
| FitnessProgramer | 2 | No public redistribution license for the listed exercise GIFs was located in the pages checked. | Not cleared; written permission or replacement required. |
| LoadMuscle | 2 | No public redistribution license for the listed animated WebP files was located in the pages checked. | Not cleared; written permission or replacement required. |
| JEFIT | 1 | Its terms say copyrighted material may not be used beyond fair use without the copyright owner's permission. No license for the listed GIF was found. | Not cleared; permission or replacement required. |
| **Total** | **58** | No source group had a clear, documented grant for redistribution in this project. A public URL or visible credit is not treated as permission. | **Do not include in the public demo or default self-host package.** |

**Retired prototype page.** `archive/routine_micro.html` (the retired v0.2 micro-session prototype, see `archive/README.md`) does not contain third-party images. It links to exercise GIFs and pages hosted by third parties (about a dozen hosts, including Giphy, StrengthLog, JEFIT and Pinterest), so a browser that opens it loads those files from their owners' servers. Those links are not in `scripts/image-sources.json` and are not part of the 58-image inventory above. They are treated like the inventory: not cleared, not redistributed by this repository, and not used by the app or the demo. GitHub Pages serves the file because it serves the whole repository; see the open decision to keep or remove it.

This is a conservative publication audit, not a legal determination of every site's rights or every possible use. The inventory is grouped by source; it does not establish rights for any individual file.

## Source terms and pages reviewed

- [StrengthLog app terms](https://www.strengthlog.com/app-terms-privacy/) — personal-use access and restrictions on reproducing or incorporating service content into other software without written authorization. Confirm directly with StrengthLog if seeking permission for its exercise GIFs.
- [Truman State Campus Recreation exercise videos and photos](https://recreation.truman.edu/photos-video-home/) — public exercise reference pages; no reuse license was identified on the pages checked.
- [Spotebi](https://spotebi.com/) — source pages are linked from `scripts/image-sources.json`; no redistribution grant was identified in the pages checked.
- [FitnessProgramer](https://fitnessprogramer.com/) — source pages are linked from `scripts/image-sources.json`; no redistribution grant was identified in the pages checked.
- [LoadMuscle](https://loadmuscle.com/) — source pages are linked from `scripts/image-sources.json`; no redistribution grant was identified in the pages checked.
- [JEFIT terms of use](https://www.jefit.com/terms-of-use) — copyrighted material beyond fair use requires permission from its owner.

## Project policy

- Public demo and default self-host distribution use the app's built-in placeholder when no locally supplied image exists.
- The default deploy does not download or upload exercise media. `scripts/deploy-app.sh --include-images` uploads only files already present locally; use it only when the operator has documented rights to redistribute each file.
- `scripts/fetch-images.mjs` remains an optional convenience downloader for sources where the user has permission. Fetching an image does not grant a license to publish or redistribute it.
- Any future media pack needs a per-file record of creator/source, license or written permission, required attribution, and permitted redistribution/modification before it is included.
- The existing production site already serves copies of these images as public static files. This audit does not remove those deployed files. Decide separately whether to remove them from the live site or obtain permission.
