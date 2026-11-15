// Deterministic coverage/failure fixtures. These do NOT verify NASA availability.
export async function installImageryFixtures(page) {
  const requests = [];
  await page.route(/^https:\/\/(trek\.nasa\.gov\/tiles\/Mars\/EQ\/|astro\.arcgis\.com\/arcgis\/rest\/services\/OnMars\/)/, async (request) => {
    const url = request.request().url();
    requests.push(url);
    // Emulate sparse HiRISE/edge coverage with an undecodable response. It takes
    // the image-error path without adding intentional HTTP 404 console errors.
    if (url.includes("/HiRISE/") || url.includes("JEZ_hirise")) {
      await request.fulfill({ status: 200, contentType: "image/png", body: "no coverage" });
      return;
    }
    const color = url.includes("/CTX/") ? "#818181"
      : url.includes("JEZ_ctx") ? "#a2a2a2"
      : url.includes("THEMIS") ? "#b8b8b8" : "#a84c2a";
    await request.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="${color}" d="M0 0h256v256H0z"/><path d="M-20 60Q128 210 270 60M-20 110Q128 260 270 110" fill="none" stroke="#34291f" stroke-opacity=".28" stroke-width="18"/><circle cx="165" cy="64" r="32" stroke="#30251c" stroke-opacity=".4" stroke-width="8" fill="none"/></svg>`,
    });
  });
  return requests;
}
