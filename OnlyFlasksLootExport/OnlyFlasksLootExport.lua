local addonName = ...
local frame = CreateFrame("Frame")

local function jsonEscape(value)
    return tostring(value or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r")
end

local function jsonString(value)
    if value == nil then return "null" end
    return '"' .. jsonEscape(value) .. '"'
end

local function findRaidInstance(targetName)
    for tier = EJ_GetNumTiers(), 1, -1 do
        EJ_SelectTier(tier)
        local index = 1
        while true do
            local instanceID, name = EJ_GetInstanceByIndex(index, true)
            if not instanceID then break end
            if name == targetName then return instanceID end
            index = index + 1
        end
    end
end

local function itemJson(itemID, name, slot, armorType, link, upgradeInfo)
    local track, currentLevel, maxLevel, maxItemLevel
    if upgradeInfo then
        track = upgradeInfo.trackString
        currentLevel = upgradeInfo.currentLevel
        maxLevel = upgradeInfo.maxLevel
        maxItemLevel = upgradeInfo.maxItemLevel
    end
    return table.concat({
        "{",
        '"itemId":', tostring(itemID or 0), ",",
        '"name":', jsonString(name), ",",
        '"slot":', jsonString(slot), ",",
        '"armorType":', jsonString(armorType), ",",
        '"itemLink":', jsonString(link), ",",
        '"track":', jsonString(track), ",",
        '"trackRank":', currentLevel and jsonString(currentLevel .. "/" .. (maxLevel or "?")) or "null", ",",
        '"maxItemLevel":', maxItemLevel and tostring(maxItemLevel) or "null",
        "}"
    })
end

local function exportRaid()
    local raidName = "The Venomous Abyss"
    local instanceID = findRaidInstance(raidName)
    if not instanceID then
        print("|cffff5555OnlyFlasks:|r Could not find " .. raidName .. " in the Encounter Journal.")
        return
    end

    EJ_SelectInstance(instanceID)
    EJ_SetDifficulty(16) -- Mythic raid
    EJ_ResetLootFilter()
    if C_EncounterJournal and C_EncounterJournal.ResetSlotFilter then
        C_EncounterJournal.ResetSlotFilter()
    end

    local bosses = {}
    local encounterIndex = 1
    while true do
        local bossName, _, encounterID = EJ_GetEncounterInfoByIndex(encounterIndex, instanceID)
        if not encounterID then break end
        EJ_SelectEncounter(encounterID)
        local items = {}
        for lootIndex = 1, EJ_GetNumLoot() do
            local info = C_EncounterJournal.GetLootInfoByIndex(lootIndex)
            if info and info.itemID then
                local cleanName = info.name and info.name:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "") or nil
                local upgradeInfo = C_Item and C_Item.GetItemUpgradeInfo and C_Item.GetItemUpgradeInfo(info.link or info.itemID)
                items[#items + 1] = itemJson(info.itemID, cleanName, info.slot, info.armorType, info.link, upgradeInfo)
            end
        end
        bosses[#bosses + 1] = table.concat({
            "{",
            '"encounterId":', tostring(encounterID), ",",
            '"name":', jsonString(bossName), ",",
            '"items":[', table.concat(items, ","), "]",
            "}"
        })
        encounterIndex = encounterIndex + 1
    end

    local json = table.concat({
        "{",
        '"raid":', jsonString(raidName), ",",
        '"difficulty":"Mythic",',
        '"exportedAt":', jsonString(date("!%Y-%m-%dT%H:%M:%SZ")), ",",
        '"bosses":[', table.concat(bosses, ","), "]",
        "}"
    })
    OnlyFlasksLootExportDB = { json = json, itemCount = 0, exportedAt = time() }
    for _, bossJson in ipairs(bosses) do
        OnlyFlasksLootExportDB.itemCount = OnlyFlasksLootExportDB.itemCount + select(2, bossJson:gsub('"itemId"', ""))
    end
    print("|cff63d497OnlyFlasks:|r Exported " .. OnlyFlasksLootExportDB.itemCount .. " loot entries. Log out or /reload to save them.")
end

SLASH_ONLYFLASKSLOOT1 = "/ofloot"
SlashCmdList.ONLYFLASKSLOOT = exportRaid

frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(_, _, loadedAddon)
    if loadedAddon == addonName then
        OnlyFlasksLootExportDB = OnlyFlasksLootExportDB or {}
        print("|cff7c9cffOnlyFlasks Loot Export loaded.|r Run /ofloot to export the live Mythic raid table.")
    end
end)
