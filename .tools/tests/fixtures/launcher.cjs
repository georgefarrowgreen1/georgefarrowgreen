// Exercise the visible launcher UI: favourites are user choices, not a full catalog.
async function launchApp(page,name){
  const menu=page.getByRole('dialog',{name:'Your apps',exact:true});
  if(!await menu.isVisible()){
    const pinned=page.locator('.ws-dock').getByRole('button',{name,exact:true});
    if(await pinned.count()&&await pinned.isVisible())await pinned.click();
    else{await page.getByRole('button',{name:'All apps',exact:true}).click();await menu.waitFor();await menu.getByRole('button',{name,exact:true}).click()}
  }else{
    const search=menu.getByRole('searchbox',{name:'Search apps',exact:true});
    if(await search.count())await search.fill('');
    await menu.getByRole('button',{name,exact:true}).click();
  }
  if(name==='All apps'){await menu.waitFor();return}
  if(name==='Today')await page.locator('#workspace[data-mode=today]').waitFor();
  else if(name==='Files')await page.locator('.ifl-files-explorer').waitFor();
  else await page.locator('#m-'+name.toLowerCase()).waitFor();
  // Icon launches are asynchronous native transitions. Assert the settled app,
  // rather than measuring the intermediate Today/library transaction.
  await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
}
module.exports={launchApp};
