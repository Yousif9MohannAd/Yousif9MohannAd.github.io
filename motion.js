(() => {
  "use strict";
  Promise.resolve(window.portfolioUIReady || window.portfolioReady).then(() => {
    const { gsap, ScrollTrigger, SplitText } = window;
    const page = document.documentElement;
    if (!gsap || !ScrollTrigger || !SplitText) { page.dataset.motionState = "static"; return; }
    gsap.registerPlugin(ScrollTrigger, SplitText);
    ScrollTrigger.config({ ignoreMobileResize:true });
    const media = gsap.matchMedia();
    media.add({ compact:"(max-width:700px)",wide:"(min-width:701px)",reduced:"(prefers-reduced-motion:reduce)" }, context => {
      page.dataset.motionEngine = "gsap";
      if (context.conditions.reduced) { page.dataset.motionState="reduced"; return; }
      const compact=context.conditions.compact;
      const entries=new Map(), transients=new Set(), removers=[];
      let frame=0,disposed=false,observer;
      const textSelector="main h1,main h2,main h3,main p,main li,.tags > span,.lab-tags > span,.profile-facts dt,.profile-facts dd,.timeline-date,.timeline-content .type,.training-head > span,.learning-index,.learning-status,.capability-top > span,.capability-domain,.contact-list > *,.hero-actions a,.focus-tabs button,.filter-tabs button,.skill-search,.scene-controls button,.scene-coordinate,.scroll-cue,.footer > *";
      const listen=(target,name,handler,options)=>{if(!target)return;target.addEventListener(name,handler,options);removers.push(()=>target.removeEventListener(name,handler,options));};
      const restore=entry=>{
        entry.animation?.kill();entry.split?.revert();entry.animation=entry.split=null;
        if(entry.originalStyle===null)entry.element.removeAttribute("style");else entry.element.setAttribute("style",entry.originalStyle);
        entry.element.dataset.textMotion="complete";
      };
      const refresh=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!disposed)ScrollTrigger.refresh(true);});};
      const focused=element=>{
        const control=document.activeElement?.closest("a,button,input,summary");
        return control&&(element===control||control.contains(element)||element.contains(control));
      };
      const play=(entry,direction=1)=>{
        if(disposed||!entry.element.isConnected||!entry.element.getClientRects().length||focused(entry.element)){restore(entry);return;}
        restore(entry);entry.element.dataset.textMotion="animating";
        entry.element.dataset.revealCount=String(Number(entry.element.dataset.revealCount||0)+1);
        entry.element.dataset.revealDirection=direction>0?"down":"up";
        const element=entry.element;
        const heading=element.matches(".display-title,#contact-title");
        const lines=heading||element.matches(".hero-text,.about-text p,.section-heading > p,.timeline-content p,.lab-copy > p");
        const delay=element.closest(".capability-card,.learning-card,.training-card") ? .025 : 0;
        if(lines&&!element.querySelector("a,button")) {
          try {
            entry.split=SplitText.create(element,{type:"lines",mask:"lines",linesClass:"motion-line",autoSplit:true,aria:"auto",onSplit(self){
              entry.animation=gsap.fromTo(self.lines,{yPercent:(heading?112:40)*direction,opacity:0},{yPercent:0,opacity:1,duration:heading?(compact?.62:.8):.55,delay,stagger:heading?.065:.035,ease:"power3.out",onComplete:()=>restore(entry)});
              return entry.animation;
            }});
          } catch { restore(entry); }
        } else {
          entry.animation=gsap.fromTo(element,{y:(compact?10:16)*direction,opacity:0},{y:0,opacity:1,duration:.5,delay,ease:"power2.out",onComplete:()=>restore(entry)});
        }
      };
      const register=element=>{
        if(entries.has(element)||!element.getClientRects().length)return;
        // One target per text unit; never fade an ancestor of another target.
        if(element.matches("p")&&element.closest(".contact-list"))return;
        const entry={element,originalStyle:element.getAttribute("style"),animation:null,split:null,trigger:null};
        entries.set(element,entry);element.dataset.textMotion="complete";
        entry.trigger=ScrollTrigger.create({trigger:element,
          start:()=>Math.max(0,Math.min(element.getBoundingClientRect().top+scrollY-innerHeight*(compact?.96:.92),ScrollTrigger.maxScroll(window)-1)),
          end:"bottom 10%",onEnter:()=>play(entry,1),onEnterBack:()=>play(entry,-1),onLeave:()=>restore(entry),onLeaveBack:()=>restore(entry)
        });
      };
      const registerWithin=scope=>{
        entries.forEach((entry,element)=>{if(!element.isConnected){entry.trigger?.kill();restore(entry);entries.delete(element);}});
        if(scope.matches?.(textSelector))register(scope);
        scope.querySelectorAll(textSelector).forEach(register);
      };
      const settleWithin=scope=>entries.forEach(entry=>{if(scope===entry.element||scope.contains(entry.element))restore(entry);});
      const burst=(targets,{y=8,stagger=.035,duration=.4}={})=>{
        const elements=gsap.utils.toArray(targets).filter(element=>element.getClientRects().length);
        if(!elements.length)return;
        gsap.killTweensOf(elements);gsap.set(elements,{clearProps:"opacity,transform"});
        const tween=gsap.fromTo(elements,{opacity:0,y},{opacity:1,y:0,duration,stagger:{amount:Math.min(.2,(elements.length-1)*stagger)},ease:"power2.out",clearProps:"opacity,transform",onComplete:()=>transients.delete(tween),onInterrupt:()=>transients.delete(tween)});
        transients.add(tween);
      };
      registerWithin(document);
      document.querySelectorAll(".section-stage").forEach(stage=>{
        gsap.fromTo(stage,{y:compact?12:24,rotationX:compact?0:1.6,transformPerspective:1400},{y:0,rotationX:0,ease:"none",scrollTrigger:{trigger:stage.parentElement,start:"top bottom",end:"top 25%",scrub:.4,invalidateOnRefresh:true}});
      });
      listen(document,"portfolio:menu",event=>{
        const links=document.querySelectorAll(".nav-links a");
        if(event.detail.open)burst(links,{y:7,stagger:.025,duration:.32});else{gsap.killTweensOf(links);gsap.set(links,{clearProps:"opacity,transform"});}
      });
      listen(document,"portfolio:layout",event=>{
        const scope=document.querySelector(event.detail?.scope||"main");if(!scope)return;
        settleWithin(scope);registerWithin(scope);
        if(event.detail?.animate)burst(scope.querySelectorAll("article:not([hidden]) h3,article:not([hidden]) p,article:not([hidden]) li"));
        refresh();
      });
      listen(document,"focusin",event=>{
        const control=event.target.closest("a,button,input,summary");if(!control)return;
        entries.forEach(entry=>{if(entry.element===control||control.contains(entry.element)||entry.element.contains(control))restore(entry);});
        gsap.killTweensOf(control);gsap.set(control,{clearProps:"opacity,transform"});
      });
      listen(document,"toggle",event=>{if(event.target.matches(".capability-card details")){settleWithin(event.target);refresh();}},true);
      const scene=document.getElementById("sceneRoot");
      listen(scene,"focuschange",()=>{const copy=document.querySelector(".focus-copy");if(copy){settleWithin(copy);burst(copy.children,{stagger:.045});}});
      listen(scene,"identityactivate",()=>burst(document.querySelectorAll(".name-first,.name-last"),{y:12,stagger:.05,duration:.5}));
      const app=document.getElementById("intelligenceApp");
      if(app){observer=new MutationObserver(()=>{registerWithin(app);refresh();});observer.observe(app,{childList:true,subtree:true});}
      listen(window,"pageshow",refresh);
      document.fonts?.ready.then(()=>{if(!disposed)refresh();});
      page.dataset.motionState="ready";page.dataset.motionReplay="both-directions";refresh();
      return ()=>{
        disposed=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();removers.forEach(remove=>remove());
        transients.forEach(tween=>tween.revert());entries.forEach(entry=>{entry.trigger?.kill();restore(entry);delete entry.element.dataset.textMotion;});
      };
    });
  });
})();
