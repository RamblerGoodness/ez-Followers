# Dev Log

blog style entries detailing the development of this project.

## 4/8/2026

Init repository and reasearch

### Poking around

Started a new world in foundry with only the base WFRP4e core module installed. Inported the content as if starting it up for the first time for a campain. made another login to test view in a player's perspective. then quickly made a character uing the buit in creator.

Next i opened the console using F12 key. started exploring and found that:

'''
ActorSheetWFRP4eCharacter extends StandardWFRP4eActorSheet
'''

using console.log to print each the the screen. looks like if I want to add a new tab I'll need to add it onto the StandardActorSheet as it definds them there. Like this:

'''
class StandardWFRP4eActorSheet extends BaseWFRP4eActorSheet
    {
        static TABS = {
    main: {
      id: "main",
      group: "primary",
      label: "Main",
    },
    skills: {
      id: "skills",
      group: "primary",
      label: "Skills",
    },
    talents: {
      id: "talents",
      group: "primary",
      label: "Talents",
    },
    combat: {
      id: "combat",
      group: "primary",
      label: "Combat",
    },
    effects: {
      id: "effects",
      group: "primary",
      label: "Effects",
    },
    religion: {
      id: "religion",
      group: "primary",
      label: "Religion",
    },
    magic: {
      id: "magic",
      group: "primary",
      label: "Magic",
    },
    trappings: {
      id: "trappings",
      group: "primary",
      label: "Trappings",
    },
    notes: {
      id: "notes",
      group: "primary",
      label: "Notes",
    }
  }
'''
I'll ask Chat GPT for help on doing this.

### The Result

Yeah Chat GPT just told me exactly how to accomplish this in a module. I'll start setting it up. My first goal now it to create an empty tab on an a character sheet.