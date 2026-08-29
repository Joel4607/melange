import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escapeHtmlText } from "../html";

const mapViewSource = readFileSync(
  new URL("../../../app/app/map-view.tsx", import.meta.url),
  "utf8",
);

describe("escapeHtmlText", () => {
  it("renders attacker-controlled popup labels as text instead of markup", () => {
    expect(
      escapeHtmlText(`<img src=x onerror="alert('xss')"> & pickup`),
    ).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt; &amp; pickup",
    );
  });

  it("leaves ordinary map labels readable", () => {
    expect(escapeHtmlText("Pickup: Makola Market")).toBe("Pickup: Makola Market");
  });

  it("routes every Leaflet popup creation and update through the encoder", () => {
    expect(mapViewSource).not.toMatch(/(?:bindPopup|setPopupContent)\((?:m\.label|runnerLabel)\)/);
    expect(
      mapViewSource.match(
        /(?:bindPopup|setPopupContent)(?:\?\.)?\(escapeHtmlText\((?:m\.label|runnerLabel)\)\)/g,
      ),
    ).toHaveLength(4);
    expect(mapViewSource).toContain(
      "runnerMarkerRef.current.setPopupContent(escapeHtmlText(runnerLabel));",
    );
  });
});
