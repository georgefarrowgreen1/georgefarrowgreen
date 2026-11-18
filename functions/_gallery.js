// Match the two photographic panels to the owner's library. The featured photographs
// have smaller exhibition copies. Other uploads use their existing immutable URLs.
const featured = [
  { id: "mqisob9gnes8x", device: "desktop", label: "Open road", alt: "Cyclists following a winding road across the hillside", src: "/projects/open-road.webp", position: "78% 50%" },
  { id: "mqismlnsexdeo", device: "mobile", label: "In the saddle", alt: "George riding towards the camera", src: "/projects/in-the-saddle.webp", position: "50% 32%" },
];

function describe(photo, slot) {
  const original = photo.id === slot.id;
  const defaultFocus = slot.device === "desktop" ? "50% 50%" : "50% 49%";
  return {
    src: original ? slot.src : "/api/background?id=" + encodeURIComponent(photo.id),
    label: original ? slot.label : slot.device === "desktop" ? "Landscape" : "On the road",
    alt: original ? slot.alt : "Photograph from George’s collection",
    position: original && photo.focus === defaultFocus ? slot.position : photo.focus || "50% 50%",
  };
}

export function galleryCollections(photos) {
  // The third panel already displays this photograph as hillside-climb.webp.
  const remaining = new Set(photos.filter(photo => photo.id !== "mqisobxefe7vd"));
  const groups = featured.map(slot => {
    const eligible = [...remaining].filter(p => !p.device || p.device === "both" || p.device === slot.device);
    const first = eligible.find(p => p.id === slot.id) || eligible.find(p => p.device === slot.device) || eligible[0];
    if (!first) return [];
    remaining.delete(first);
    return [describe(first, slot)];
  });
  for (const photo of remaining) {
    const index = photo.device === "mobile" ? 1 : 0;
    groups[index].push(describe(photo, featured[index]));
  }
  return groups;
}
