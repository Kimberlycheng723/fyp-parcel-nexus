# Password-reset email illustration

`password-reset-illustration.jpg` is embedded as an inline CID attachment by
`src/templates/passwordResetEmail.js`. Keep this asset with the backend deployment;
it does not need a public image URL. Other email templates do not attach it.

The original PNG is retained as a source asset. With the user's approval, the
email copy was resized to 800px wide, flattened onto the card's white background,
and compressed as a quality-82 JPEG using the bundled Sharp runtime. No new
application dependency was installed. Some email clients still list CID images
as attachments; hiding that list reliably requires publicly hosted images.

The illustration was produced with the built-in image generation tool from the
user-approved email reference on 2026-10-12. The original reference was named
`codex-clipboard-b28fc9e3-0369-40aa-9fe5-a5d58ed348fc.png`.

## Generation Prompt

Use case: background-extraction. Asset type: inline illustration for a
password-reset HTML email. Extract ONLY the top illustration from the supplied
email mockup as a standalone transparent PNG, tightly framed landscape composition
about 3:2. Preserve as closely as possible the smiling woman with long dark hair
wearing blue and holding an open blue envelope with a white letter, the small
cardboard parcel floating to her left, the blue paper airplane and dotted flight
path to her right, and the subtle very pale lavender abstract shapes immediately
behind the illustration. Preserve pose, friendly 3D clay rendering, soft lighting,
and blue/lavender/tan colors. Remove ALL text, buttons, white email card, exterior
lavender page background, footer, and borders. No letters, words, logos, watermark,
or new objects. Real alpha transparency around the illustration, not a checkerboard
pattern. Keep the whole illustration visible without cropped airplane or parcel.

## Focused Checks

Run `node --test tests/password-reset-email.test.js` from the backend directory
with its existing dependencies installed. The tests assemble emails using
Nodemailer's stream transport; no SMTP email is sent and no database is changed.
The final received-email appearance still requires a check in the target mail
clients, which may vary in font, rounded-corner, and image support.
