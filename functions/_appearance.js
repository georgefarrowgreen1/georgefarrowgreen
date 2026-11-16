// Account-wide, curated identifiers. Never accept CSS or arbitrary colour input.
export const PALETTES = Object.freeze(['inflite','coast','iris','ember','rose','graphite']);
export function appearanceOf(user) {
  return {appearance:['light','dark'].includes(user.appearance)?user.appearance:'auto',palette:PALETTES.includes(user.theme_palette)?user.theme_palette:'inflite',
    glass:user.glass_enabled!==0,glassStrength:Number.isInteger(user.glass_strength)&&user.glass_strength>=0&&user.glass_strength<=100?user.glass_strength:70};
}
