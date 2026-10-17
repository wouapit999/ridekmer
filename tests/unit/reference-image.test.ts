import { describe, expect, it, vi } from "vitest";

import {
  findReferenceImage,
  parseImageInfo,
  pickPageImage,
} from "@/server/vehicles/reference-image";

const searchAnswer = {
  query: {
    pages: [
      { title: "Toyota RAV4 (XA50)", index: 2, pageimage: "Second.jpg" },
      { title: "Toyota RAV4", index: 1, pageimage: "2019_Toyota_RAV4.jpg" },
    ],
  },
};

const infoAnswer = (license: string, url = "https://upload.wikimedia.org/a/b/960px-x.jpg") => ({
  query: {
    pages: [
      {
        imageinfo: [
          {
            thumburl: url,
            thumbwidth: 960,
            thumbheight: 640,
            descriptionurl: "https://commons.wikimedia.org/wiki/File:2019_Toyota_RAV4.jpg",
            extmetadata: {
              Artist: {
                value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane&nbsp;Doe</a>',
              },
              LicenseShortName: { value: license },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
            },
          },
        ],
      },
    ],
  },
});

function fakeFetch(...bodies: unknown[]) {
  const queue = [...bodies];
  return vi.fn(async () => new Response(JSON.stringify(queue.shift()), { status: 200 }));
}

describe("reference vehicle photos", () => {
  it("picks the lead image of the best-ranked article", () => {
    expect(pickPageImage(searchAnswer)).toBe("2019_Toyota_RAV4.jpg");
    expect(pickPageImage({ query: { pages: [{ title: "No image" }] } })).toBeNull();
    expect(pickPageImage({})).toBeNull();
  });

  it("keeps the author, licence and source page, and strips markup", () => {
    expect(parseImageInfo(infoAnswer("CC BY-SA 4.0"))).toEqual({
      url: "https://upload.wikimedia.org/a/b/960px-x.jpg",
      width: 960,
      height: 640,
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:2019_Toyota_RAV4.jpg",
      author: "Jane Doe",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    });
    expect(parseImageInfo(infoAnswer("Public domain"))?.license).toBe("Public domain");
    expect(parseImageInfo(infoAnswer("CC0"))?.license).toBe("CC0");
  });

  it("refuses non-free licences and images hosted elsewhere", () => {
    expect(parseImageInfo(infoAnswer("Fair use"))).toBeNull();
    expect(parseImageInfo(infoAnswer("All rights reserved"))).toBeNull();
    expect(parseImageInfo(infoAnswer("CC BY 4.0", "https://example.com/x.jpg"))).toBeNull();
    expect(parseImageInfo({})).toBeNull();
  });

  it("chains the article search and the file lookup", async () => {
    const fetchImpl = fakeFetch(searchAnswer, infoAnswer("CC BY 4.0"));
    const image = await findReferenceImage("Toyota", "RAV4", fetchImpl);
    expect(image?.author).toBe("Jane Doe");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [searchUrl] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(searchUrl).toContain("pilicense=free");
    expect(decodeURIComponent(searchUrl.replace(/\+/g, " "))).toContain("Toyota RAV4 car");
    const [infoUrl] = fetchImpl.mock.calls[1] as unknown as [string];
    expect(decodeURIComponent(infoUrl)).toContain("File:2019_Toyota_RAV4.jpg");
  });

  it("returns null instead of throwing when Wikipedia is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(findReferenceImage("Toyota", "RAV4", fetchImpl)).resolves.toBeNull();
    const notOk = vi.fn(async () => new Response("busy", { status: 503 }));
    await expect(findReferenceImage("Toyota", "RAV4", notOk)).resolves.toBeNull();
  });
});
