-- TEC-28 (P0-05 content): first 40 Austin experiences, DRAFT.
--
-- Every row below was drafted from web search results on 2026-11-11 and has NOT been checked by a person.
-- That is why every `source` starts with `PLACEHOLDER:` (AGENTS.md rule 9, spec-decision G5).
-- A person who knows Austin should open each venue's own page, then for each row: confirm price, hours and
-- booking, fix the coordinates, add an image, replace `source` with the page checked, and set `checked_on`.
--
-- Still missing before TEC-28 can close:
--   * `checked_on` is null on every row (nobody has checked anything yet).
--   * `image_url` is null on every row (no licensed images chosen). Spec allows a category placeholder meanwhile.
--   * `lat`/`lng` are approximate where given and null where I could not place the venue (HOPE, Barton Creek
--     Greenbelt, several studios and operators). Acceptance requires coordinates inside Austin on every row.
--   * Weekly trivia nights are `timing_kind = 'fixed'` with `sessions` null: nobody has confirmed dates yet.
--     Fill `sessions` as [{"start_local","end_local"}] in America/Chicago (G6) once checked.
--   * `booking_required` null means booking is unknown (G15). The trivia rows use it: the sources don't say.
--   * The demo script names "Sketch and stroll" and "Clay and conversation" as flexible-time experiences.
--     The team picks those venues (D7); they are not in this file. "Barton Springs swim" is.
--
-- Prices are in dollars. When the unit is not the whole visit it is said in the description (per hour, per play).

insert into public.experiences
  (name, category, description, lat, lng, area, address, provider_name,
   price_kind, price_min, price_max, timing_kind, hours_text, duration_min,
   booking_required, booking_url, source)
values
-- ---------------------------------------------------------------- Art and walks
('HOPE Outdoor Gallery', 'Art and walks',
 'Outdoor graffiti and mural park that reopened in December 2025 at a new site near the airport. Listings from before the move still show the old Baylor Street site.',
 null, null, null, '741 Dalton Ln', null,
 'free', 0, 0, 'flexible', 'Reported Wed-Sun, 10 a.m.-6 p.m.; older listings say sunrise to sunset', null,
 false, null, 'PLACEHOLDER: Time Out Austin and Austin news coverage, found by web search (https://www.timeout.com/austin/attractions/hope-outdoor-gallery)'),

('Blanton Museum of Art', 'Art and walks',
 'University of Texas art museum. Sources disagree on prices: $15 adult and $12 senior in one, $8 youth in another. Free on Tuesdays with check-in, and the grounds are free to walk.',
 30.2807, -97.7373, 'UT campus', '200 E Martin Luther King Jr Blvd', 'Blanton Museum of Art',
 'estimated', 12, 15, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Blanton FAQ and third-party listings, found by web search (https://blantonmuseum.org/visit/faqs/)'),

('Harry Ransom Center', 'Art and walks',
 'University of Texas library and museum with rotating exhibits. Listed as free; one guide mentions a free window on Sundays from 3 to 5 p.m.',
 30.2844, -97.7415, 'UT campus', '300 W 21st St', 'Harry Ransom Center',
 'free', 0, 0, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Austin museum guides, found by web search (https://www.lonelyplanet.com/articles/best-museums-in-austin)'),

('Mexic-Arte Museum', 'Art and walks',
 'Museum of Mexican and Latino art and culture on Congress Avenue. One guide lists $7 adult, another $12 adult, $10 senior and $5 youth; several say Sundays are free.',
 30.2686, -97.7430, 'Downtown', '419 Congress Ave', 'Mexic-Arte Museum',
 'estimated', 7, 12, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Mexic-Arte site and Austin museum guides, found by web search (https://mexic-artemuseum.org/visit)'),

('Laguna Gloria sculpture park', 'Art and walks',
 'Lakeside grounds and sculpture park run by The Contemporary Austin. Most sources say $10 adult; one lists a much higher figure. Advance tickets are reportedly required.',
 30.3163, -97.7673, 'West Austin', '3809 W 35th St', 'The Contemporary Austin',
 'estimated', 10, 10, 'flexible', null, null,
 true, null, 'PLACEHOLDER: Austin museum guides, found by web search (https://whichmuseum.com/museum/laguna-gloria-the-contemporary-austin-8664/tickets-prices)'),

('Umlauf Sculpture Garden', 'Art and walks',
 'Sculpture garden and museum near Zilker Park. Entry is charged (free for children under 12, active military and veterans); the price was not in the sources.',
 30.2635, -97.7677, 'Zilker', '605 Robert E Lee Rd', 'Umlauf Sculpture Garden & Museum',
 'unknown', null, null, 'flexible', null, null,
 false, null, 'PLACEHOLDER: free-things-to-do guides, found by web search (https://www.lonelyplanet.com/articles/free-things-to-do-in-austin)'),

-- ---------------------------------------------------------------- Make something
('Intro wheel throwing at Austin Gallery', 'Make something',
 'Beginner pottery class. The guide lists $75 for 90 minutes at the McPhaul St studio and $95 for a one-time session at the 6th Street studio.',
 null, null, null, null, 'Austin Gallery',
 'estimated', 75, 95, 'unknown', null, 90,
 true, null, 'PLACEHOLDER: Austin Gallery class guide, found by web search (https://www.austingallery.org/blog/adult-art-classes-workshops-austin)'),

('Intro wheel workshop at Rosa Pottery Studio', 'Make something',
 'Two-hour introduction to the pottery wheel in groups of up to 8. The studio is 18 and over. Ticket price on Eventbrite was about $92 with no refunds.',
 null, null, null, null, 'Rosa Pottery Studio',
 'estimated', 92.55, 92.55, 'unknown', null, 120,
 true, null, 'PLACEHOLDER: Eventbrite listing, found by web search (https://www.eventbrite.com/e/introductory-wheel-throwing-lesson-tickets-1989924122618)'),

('Pottery workshop at Pot Daddy Studio', 'Make something',
 'Guided two-hour wheel throwing and glazing workshop for adults of any skill level. One article calls the studio donation-based; the price needs checking. Pieces are fired and sent home later.',
 null, null, 'West Austin', null, 'Pot Daddy Studio',
 'unknown', null, null, 'unknown', null, 120,
 true, null, 'PLACEHOLDER: Dallasites101 and Community Impact articles, found by web search (https://www.dallasites101.com/blog/post/pot-daddy-texas-most-unique-pottery-class-austin-glass-dome-studio/)'),

('Pasta-making class at Blue Owl Brewing', 'Make something',
 'Two-hour cooking class held at a brewery, usually in the evening. One listing shows $75 per adult; others differ.',
 30.2556, -97.7197, 'East Austin', '2400 E Cesar Chavez St', 'Blue Owl Brewing',
 'estimated', 75, 75, 'unknown', null, 120,
 true, null, 'PLACEHOLDER: Expedia activity listing, found by web search (https://www.expedia.com/things-to-do/pasta-making-cooking-class-at-a-local-brewery-in-austin.a50133829.activity-details)'),

('Soy candle workshop at Slow North', 'Make something',
 'Pour your own soy candle. Standard workshops start at $60; private sessions from $65 and off-site sessions from $75.',
 null, null, null, null, 'Slow North',
 'estimated', 60, 75, 'unknown', null, null,
 true, null, 'PLACEHOLDER: Slow North workshop listings, found by web search (https://www.slownorth.com/collections/workshops-and-events-in-austin)'),

-- ---------------------------------------------------------------- Outdoors
('Barton Springs swim', 'Outdoors',
 'Spring-fed pool in Zilker Park. The City of Austin page says admission is not being charged now and fees resume March 13, 2027. Hours differ between guides, so copy them from the city page.',
 30.2639, -97.7710, 'Zilker', '2201 William Barton Dr', 'City of Austin Parks and Recreation',
 'free', 0, 0, 'flexible', 'City page: open every day except Thursday; confirm hours', null,
 false, null, 'PLACEHOLDER: City of Austin Barton Springs page, found by web search (https://www.austintexas.gov/bartonsprings)'),

('Mount Bonnell', 'Outdoors',
 'Hilltop viewpoint over Lake Austin, about 781 feet up. Free to visit with free parking. Sunset is popular.',
 30.3207, -97.7731, 'West Austin', '3800 Mount Bonnell Rd', 'City of Austin Parks and Recreation',
 'free', 0, 0, 'flexible', null, null,
 false, null, 'PLACEHOLDER: free-things-to-do guides, found by web search (https://www.lonelyplanet.com/articles/free-things-to-do-in-austin)'),

('Barton Creek Greenbelt', 'Outdoors',
 'Free hiking, mountain biking and climbing trails with several trailheads. Pick a trailhead and set coordinates before publishing.',
 null, null, null, null, 'City of Austin Parks and Recreation',
 'free', 0, 0, 'flexible', null, null,
 false, null, 'PLACEHOLDER: free-things-to-do guides, found by web search (https://www.lonelyplanet.com/articles/free-things-to-do-in-austin)'),

('Zilker Botanical Garden', 'Outdoors',
 'City botanical garden next to Zilker Park. The city parks page listed $3 adult, cash or check only, which may be out of date. Some sources mention free days and free entry with SNAP benefits.',
 30.2685, -97.7745, 'Zilker', '2220 Barton Springs Rd', 'City of Austin Parks and Recreation',
 'estimated', 3, 3, 'flexible', null, null,
 false, null, 'PLACEHOLDER: City of Austin parks page and guides, found by web search (https://www.austintexas.gov/parks/programs/historic-austin-parks)'),

('Austin Nature & Science Center', 'Outdoors',
 'City nature center in Zilker Park with trails and exhibits. Admission is free; donations are accepted.',
 30.2708, -97.7740, 'Zilker', '301 Nature Center Dr', 'City of Austin Parks and Recreation',
 'free', 0, 0, 'flexible', null, null,
 false, null, 'PLACEHOLDER: free-things-to-do guides, found by web search (https://www.lonelyplanet.com/articles/free-things-to-do-in-austin)'),

('Mayfield Park', 'Outdoors',
 'Small city park next to Laguna Gloria. Always free.',
 30.3170, -97.7690, 'West Austin', '3505 W 35th St', 'City of Austin Parks and Recreation',
 'free', 0, 0, 'flexible', null, null,
 false, null, 'PLACEHOLDER: free-things-to-do guides, found by web search (https://www.tribeza.com/austin-city-guides/arts/12-fun-free-things-to-do-austin/)'),

-- ---------------------------------------------------------------- Food and drink
('Franklin Barbecue', 'Food and drink',
 'Barbecue restaurant known for long lines. Reported open Tuesday to Sunday from 11 a.m. until sold out, often by 2 or 3 p.m., closed Monday. Prices were not in the sources.',
 30.2701, -97.7313, 'East Austin', '900 E 11th St', 'Franklin Barbecue',
 'unknown', null, null, 'flexible', 'Reported Tue-Sun from 11 a.m. until sold out', null,
 false, null, 'PLACEHOLDER: Austin barbecue guides, found by web search (https://www.atly.com/united-states/texas/austin/best-bbq-food-trucks)'),

('Rainey Street food trucks', 'Food and drink',
 'Cluster of food trucks among the bars on Rainey Street, with hours weighted to the evening. One 2024 listing guessed about $20 for two people.',
 30.2587, -97.7389, 'Downtown', 'Rainey St', null,
 'unknown', null, null, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Rainey Street Food Court listing and Via 313 article, found by web search (https://www.via313.com/5-best-food-trucks-on-rainey-street-austin-for-a-flavourful-grab/)'),

('Downtown Austin food tour', 'Food and drink',
 'Guided tour with six food stops, starting at a food hall and including food trucks and a breakfast taco spot. Listed at $89 per person, taxes included.',
 null, null, 'Downtown', null, 'Cozymeal',
 'exact', 89, 89, 'unknown', null, null,
 true, null, 'PLACEHOLDER: Cozymeal listing, found by web search (https://www.cozymeal.com/food-tour/21915/the-best-of-downtown-austin)'),

('Austin beer and food tour by bike', 'Food and drink',
 'Bike tour with brewery stops and a food truck entree. The price was not in the sources.',
 null, null, null, null, 'Musement listing',
 'unknown', null, null, 'unknown', null, null,
 true, null, 'PLACEHOLDER: Musement listing, found by web search (https://www.musement.com/us/austin/austin-beer-and-food-tour-by-bike-216489/)'),

('Austin food truck tour', 'Food and drink',
 'Two-hour tour of food trucks and Southern food. The price was not in the sources.',
 null, null, null, null, 'Airbnb Experiences listing',
 'unknown', null, null, 'unknown', null, 120,
 true, null, 'PLACEHOLDER: Airbnb Experiences listing, found by web search (https://www.airbnb.co.in/experiences/6929186)'),

-- ---------------------------------------------------------------- Games and trivia
('Trivia at Gibson Street Bar', 'Games and trivia',
 'Weekly Geeks Who Drink trivia night on South Lamar, Tuesdays at 8 p.m. Cost was not in the sources.',
 null, null, 'South Lamar', null, 'Gibson Street Bar',
 'unknown', null, null, 'fixed', 'Reported Tuesdays, 8 p.m.', null,
 null, null, 'PLACEHOLDER: Austin trivia night roundups, found by web search (https://neighborhoods.com/blog/four-austin-bars-with-trivia-nights)'),

('Trivia at Gourmands', 'Games and trivia',
 'Weekly Geeks Who Drink trivia night at an East Austin sandwich-and-drinks bar, Wednesday nights. Cost was not in the sources.',
 null, null, 'East Austin', null, 'Gourmands',
 'unknown', null, null, 'fixed', 'Reported Wednesday nights', null,
 null, null, 'PLACEHOLDER: Austin trivia night roundups, found by web search (https://neighborhoods.com/blog/four-austin-bars-with-trivia-nights)'),

('Emerald Tavern Games & Cafe', 'Games and trivia',
 'Board game cafe on Research Blvd. Free entry; renting from the game library costs $2 to $5 per session.',
 null, null, 'North Austin', null, 'Emerald Tavern Games & Cafe',
 'estimated', 2, 5, 'flexible', 'Reported Mon-Thu 11 a.m.-11 p.m., Fri 11 a.m.-midnight, Sat 10 a.m.-midnight, Sun 10 a.m.-8 p.m.', null,
 false, null, 'PLACEHOLDER: Austin game bars roundup, found by web search (https://www.endeavor-re.com/news/14-austin-bars-where-you-can-play-games/)'),

('Vigilante Gastropub & Games', 'Games and trivia',
 'Bar with a large game library. A $5 game night fee covers unlimited access to the library, with an exemption for short stays and bar seating.',
 null, null, null, null, 'Vigilante Gastropub & Games',
 'exact', 5, 5, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Austin game bars roundup, found by web search (https://www.endeavor-re.com/news/14-austin-bars-where-you-can-play-games/)'),

('Cidercade Austin', 'Games and trivia',
 'Arcade bar with flat admission and unlimited play, including pinball. The admission price was not in the sources.',
 null, null, null, null, 'Cidercade',
 'unknown', null, null, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Austin arcade roundup, found by web search (https://austinot.com/arcade-games-austin-texas)'),

('Pinballz Arcade', 'Games and trivia',
 'Pay-per-play arcade and pinball hall. Listed at roughly $0.75 to $1.25 per play, so the price range here is per play, not per visit.',
 null, null, null, null, 'Pinballz Arcade',
 'estimated', 0.75, 1.25, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Austin pinball guide, found by web search (https://www.kineticist.com/news/play-pinball-austin-texas.md)'),

-- ---------------------------------------------------------------- Music and film
('Paramount Theatre', 'Music and film',
 'Historic theater built in 1915 on Congress Avenue. Hosts concerts, plays, comedy and classic film series. Prices depend on the show.',
 30.2685, -97.7432, 'Downtown', '713 Congress Ave', 'Paramount Theatre',
 'unknown', null, null, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Austin venue guides, found by web search (https://atxtoday.6amcity.com/city-guide/play/live-music-venues-austin-tx)'),

('Continental Club', 'Music and film',
 'Live music club on South Congress, open since 1955. Weekday covers are typically $7 to $25 after 9 p.m., with advance tickets for weekend shows.',
 30.2523, -97.7495, 'South Congress', '1315 S Congress Ave', 'Continental Club',
 'estimated', 7, 25, 'unknown', 'Shows after 9 p.m.; check the calendar', null,
 false, null, 'PLACEHOLDER: InsideHook and Lonely Planet venue guides, found by web search (https://www.lonelyplanet.com/articles/where-to-see-live-music-austin)'),

('Broken Spoke', 'Music and film',
 'Honky-tonk dance hall on South Lamar. Dance hall acts charge about $10 to $20 at the door; the restaurant reportedly has free live music from 6 to 8 p.m., Tuesday to Saturday.',
 30.2399, -97.7816, 'South Lamar', '3201 S Lamar Blvd', 'Broken Spoke',
 'estimated', 10, 20, 'unknown', 'Reported dance hall acts start 8:15-9 p.m., Tue-Sat', null,
 false, null, 'PLACEHOLDER: Texas Highways style venue listing, found by web search (https://texashighways.com/?p=56194)'),

('Saxon Pub', 'Music and film',
 'Live music bar on South Lamar. One listing gives a $5 to $15 cover, first come with no advance tickets, and a no-cover happy hour from 6 to 7:30 p.m. on weekdays.',
 30.2584, -97.7648, 'South Lamar', '1320 S Lamar Blvd', 'Saxon Pub',
 'estimated', 5, 15, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Austin live music venue listings, found by web search (https://www.houstoniamag.com/arts-and-culture/music/where-to-see-live-music-in-austin)'),

('ACL Live at the Moody Theater', 'Music and film',
 'Downtown concert venue and home of the PBS series Austin City Limits. Prices depend on the show.',
 30.2652, -97.7474, 'Downtown', '310 W Willie Nelson Blvd', 'ACL Live at the Moody Theater',
 'unknown', null, null, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Austin venue guides, found by web search (https://venuemaps.net/venues/category/music-venues/texas/austin/)'),

('The Mohawk', 'Music and film',
 'Indie music venue on Red River Street, open since 2006, for local and emerging acts. Prices depend on the show.',
 30.2696, -97.7363, 'Downtown', '912 Red River St', 'The Mohawk',
 'unknown', null, null, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Culture Trip venue guide, found by web search (https://www.theculturetrip.com/north-america/usa/texas/articles/texas-culture-guide-austin-s-9-best-live-music-venues)'),

('Alamo Drafthouse South Lamar', 'Music and film',
 'Movie theater with food service and themed sing-along screenings. The downtown location has closed, so check that this one is still open. Prices depend on the showing.',
 30.2563, -97.7628, 'South Lamar', '1120 S Lamar Blvd', 'Alamo Drafthouse',
 'unknown', null, null, 'unknown', null, null,
 false, null, 'PLACEHOLDER: Fodors and Lonely Planet guides, found by web search (https://cdn.fodors.com/world/north-america/usa/texas/austin/things-to-do/performing-arts)'),

-- ---------------------------------------------------------------- Active
('Austin Bouldering Project day pass', 'Active',
 'Indoor climbing gym. The gym''s class page lists a day pass at $25 (older third-party sites say $16 to $20). The first visit is reportedly free and includes rental shoes and chalk.',
 null, null, null, null, 'Austin Bouldering Project',
 'exact', 25, 25, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Bouldering Project Austin class page, found by web search (https://boulderingproject.com/austin-climbing-classes/)'),

('Congress Avenue Kayaks', 'Active',
 'Kayak and paddleboard rental on Lady Bird Lake. One source lists $10 per hour for a single kayak and $15 per hour for a double; the page may be old, so the range here is per hour.',
 30.2627, -97.7440, 'Downtown', '74 Trinity St', 'Congress Avenue Kayaks',
 'estimated', 10, 15, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Community Impact article, found by web search (https://communityimpact.com/central-austin/news/congress-avenue-kayaks/)'),

('Rowing Dock kayak and paddleboard rental', 'Active',
 'City concession on the south shore of Lady Bird Lake near Zilker Park. The first hour is charged up front, then billed in half-hour steps. Rates were not in the sources.',
 30.2634, -97.7689, 'Zilker', '2418 Stratford Dr', 'Austin Rowing Dock',
 'unknown', null, null, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Rowing Dock site, found by web search (https://www.rowingdock.com/plan-your-visit/)'),

('Live Love Paddle', 'Active',
 'Paddleboard and kayak rental on Lady Bird Lake. Rates were not in the sources.',
 30.2455, -97.7312, 'East Riverside', '1610 E Riverside Dr', 'Live Love Paddle',
 'unknown', null, null, 'flexible', null, null,
 false, null, 'PLACEHOLDER: Docklyne rental directory, found by web search (https://docklyne.com/austin-tx/boat-rentals/live-love-paddle)'),

('Donut boat rental on Lady Bird Lake', 'Active',
 'Electric party boat rental from Capital Cruises at $100 per hour with a two-hour minimum, so the price here is per hour.',
 null, null, 'Downtown', null, 'Capital Cruises',
 'exact', 100, 100, 'flexible', null, null,
 true, null, 'PLACEHOLDER: Capital Cruises site, found by web search (https://capitalcruises.com/?p=1897)');

-- =====================================================================================================
-- TEC-85 (P0-05 content): 60 more rows, DRAFT, bringing the catalog to 100. Not checked by a person.
--
-- Same rules as the first 40: every `source` starts with `PLACEHOLDER:` (AGENTS.md rule 9, G5), `checked_on`
-- and `image_url` are null on every row, and a person must open each venue page, confirm price, hours and
-- booking, fix coordinates, add an image and replace `source` before a row counts as real.
--
-- How these were drafted (2026-11-13): web searches by category for the rows whose source is a URL; rows whose
-- source says "general knowledge" were NOT found in a search at all and need the most careful check.
--   * Coordinates are approximate where given and null where I was not sure of the place.
--   * `sessions` (G6, America/Chicago) are generated from a reported WEEKLY schedule for the next four
--     occurrences, Nov 16 to Dec 17, 2026. End times are assumed (2 hours for trivia, 4 for markets).
--     Thanksgiving (Thu Nov 26) is skipped for the Thursday events. Replace them with the venue's real dates.
--   * Prices that a source gave per lane, per play or per hour say so in the description.
--   * `booking_required` null means unknown (G15).
-- Counts: 100 rows in total; 11 of them have `sessions` (set session times): 10 new rows plus Gibson Street Bar.
-- =====================================================================================================

insert into public.experiences
  (name, category, description, lat, lng, area, address, provider_name,
   price_kind, price_min, price_max, timing_kind, hours_text, duration_min,
   booking_required, booking_url, source, sessions)
values

-- ---------------------------------------------------------------- Art and walks (TEC-85)
('Bullock Texas State History Museum', 'Art and walks', 'State history museum on Congress Avenue. A guide says First Sundays are free for everyone; the regular adult price was not in the sources.', 30.2806, -97.7385, 'Downtown', '1800 Congress Ave', 'Bullock Texas State History Museum', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Austinot museum guide and a free-art roundup, found by web search (https://austinot.com/best-museums-in-austin-texas)', null),
('Julia C. Butridge Gallery at the Dougherty Arts Center', 'Art and walks', 'City-run gallery with rotating exhibitions. The city page says the exhibitions and related events are free and open to the public; its dates looked inconsistent, so check what is on.', 30.2603, -97.765, 'Zilker', '1110 Barton Springs Rd', 'City of Austin Arts and Culture', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: City of Austin gallery page, found by web search (https://austintexas.gov/jcbgallery)', null),
('Free Little Art Galleries', 'Art and walks', 'About ten tiny take-one, leave-one art boxes scattered around Austin. Free. The list of locations needs to be collected before this can be pinned.', null, null, null, null, null, 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: ATXtoday, found by web search (https://atxtoday.6amcity.com/culture/free-little-art-gallery-austin)', null),
('East Austin Studio Tour', 'Art and walks', 'Free self-guided tour of more than 400 artists'' studios in East Austin. It is an annual event; this year''s dates were not in the sources.', null, null, 'East Austin', null, null, 'free', 0, 0, 'unknown', null, null, false, null, 'PLACEHOLDER: Canvaslot art guide, found by web search (https://blog.canvaslot.com/where-to-find-great-art-in-texas-without-spending-a-dime/)', null),
('Austin Central Library', 'Art and walks', 'Large downtown library with art, reading rooms and a rooftop garden. Free to walk in.', 30.2655, -97.7529, 'Downtown', '710 W Cesar Chavez St', 'Austin Public Library', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Elisabet Ney Museum', 'Art and walks', 'Small free museum in the studio of a 19th-century sculptor in Hyde Park. Check hours before going.', 30.3055, -97.7243, 'Hyde Park', '304 E 44th St', 'City of Austin', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('The Contemporary Austin, Jones Center', 'Art and walks', 'Downtown contemporary art museum on Congress Avenue. The ticket price was not checked.', 30.2699, -97.7432, 'Downtown', '700 Congress Ave', 'The Contemporary Austin', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Congress Avenue Bridge bats', 'Art and walks', 'Free evening bat watch from the bridge or the lake shore. The bats are usually seen at dusk in the warmer months; confirm the season and the best viewing spots.', 30.2611, -97.7449, 'Downtown', 'Congress Ave bridge', null, 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('"I love you so much" mural', 'Art and walks', 'Well-known painted wall on South Congress, a quick free photo stop. Confirm the exact spot.', 30.2515, -97.7494, 'South Congress', 'S Congress Ave', null, 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),

-- ---------------------------------------------------------------- Make something (TEC-85)
('DIY candle class at Texas Saké Company', 'Make something', 'Two-hour candle-making class at a sake bar. Listed at $55 per adult with free cancellation; the listing''s date had already passed.', null, null, 'East Austin', 'E St Elmo Rd', 'Classpop', 'estimated', 55, 55, 'unknown', null, 120, true, null, 'PLACEHOLDER: Expedia and Travelocity listings, found by web search (https://www.expedia.com/zh/things-to-do/diy-candle-making-class-at-a-local-sake-bar-in-austin.a50977076.activity-details)', null),
('Candle making at a local brewery', 'Make something', 'Classpop candle class held at an Austin brewery. One listing shows $60 per adult, marked down from $75, with free cancellation and instant confirmation.', null, null, null, null, 'Classpop', 'estimated', 60, 75, 'unknown', null, null, true, null, 'PLACEHOLDER: Travelocity listing, found by web search (https://www.travelocity.com/things-to-do/make-your-own-candle-at-a-local-brewery-in-austin.a51068585.activity-details)', null),
('Candle workshop at Edgewater Candles ATX', 'Make something', 'Candle-pouring workshop on East 41st Street, $50 per guest on Classbento. The public class showed a waitlist.', null, null, null, 'E 41st St', 'Edgewater Candles ATX', 'exact', 50, 50, 'unknown', null, null, true, null, 'PLACEHOLDER: Classbento listing, found by web search (https://www.classbento.com/candle-making-class-austin)', null),
('Candle making at KraftStories', 'Make something', 'Candle-making classes at a downtown Austin studio. The page is aimed at private groups (birthdays, team events); no price was in the sources.', null, null, 'Downtown', null, 'KraftStories', 'unknown', null, null, 'unknown', null, null, true, null, 'PLACEHOLDER: KraftStories page, found by web search (https://kraftstories.com/pages/texas-austin/candle-making)', null),
('Taste of Glassblowing at Ghost Pepper Glass', 'Make something', 'Crash course in glassblowing at a Springdale studio, reportedly on Friday and Saturday evenings. No price was in the sources.', null, null, 'East Austin', null, 'Ghost Pepper Glass', 'unknown', null, null, 'unknown', 'Reported Friday and Saturday evenings', null, true, null, 'PLACEHOLDER: found by web search; the result gave no venue page yet', null),

-- ---------------------------------------------------------------- Outdoors (TEC-85)
('Gus Fruh swimming hole', 'Outdoors', 'Free swimming hole on the Barton Creek Greenbelt. Check water levels before swimming.', null, null, null, null, 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Bull Creek swimming holes', 'Outdoors', 'Trails and four main swimming holes along Bull Creek, best after rain. Free.', null, null, 'Northwest Austin', null, 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Pease Park', 'Outdoors', 'Free park with trails, a creek and seasonal swimming spots after rain.', 30.2766, -97.7566, 'Central Austin', '1100 Kingsbury St', 'Pease Park Conservancy', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Blunn Creek Greenbelt', 'Outdoors', 'Free, easy stroll in Travis Heights connecting Little Stacy and Big Stacy parks.', null, null, 'Travis Heights', null, 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Mueller Lake Park', 'Outdoors', 'Free 6.5-acre loop around the lake for walking or running.', 30.2995, -97.705, 'Mueller', 'Mueller Lake Park', 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Upper Barton Creek Greenbelt hike', 'Outdoors', 'About 5 miles out and back, rated easy to intermediate on a hiking site. Free, no reservation.', null, null, null, null, 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: outdoor recreation guide, found by web search (https://neuhausre.com/guides/outdoor-recreation-guide-austin/)', null),
('McKinney Falls State Park', 'Outdoors', 'State park on Onion Creek with falls and trails. It charges an entry fee run by Texas Parks and Wildlife; the amount and reservation rules were not checked.', 30.184, -97.72, 'Southeast Austin', '5808 McKinney Falls Pkwy', 'Texas Parks and Wildlife', 'unknown', null, null, 'flexible', null, null, null, null, 'PLACEHOLDER: Austin Family, found by web search (https://austinfamily.com/?p=311938)', null),
('Deep Eddy Pool', 'Outdoors', 'Spring-fed city pool near Lady Bird Lake. Current admission rules were not confirmed.', 30.2761, -97.7708, 'Zilker', '401 Deep Eddy Ave', 'City of Austin Parks and Recreation', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin Parks Foundation guide, found by web search (https://austinparks.org/blog/12-swimming-holes-around-austin-guaranteed-to-keep-you-cool-this-summer/)', null),
('Lady Bird Lake Hike-and-Bike Trail', 'Outdoors', 'Free loop trail around Lady Bird Lake, good for a walk, run or bike ride.', null, null, 'Downtown', null, 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Zilker Park', 'Outdoors', 'Large free city park with open lawn, trails and the Barton Springs area. Check for events that need a ticket.', 30.2669, -97.7729, 'Zilker', '2100 Barton Springs Rd', 'City of Austin Parks and Recreation', 'free', 0, 0, 'flexible', null, null, false, null, 'PLACEHOLDER: Free Arenas, found by web search (https://freearenas.com/zilker-park-near-austin-texas.html)', null),

-- ---------------------------------------------------------------- Food and drink (TEC-85)
('Texas Chili Parlor', 'Food and drink', 'Longtime chili and burger spot near the Capitol. A burger and fries came to about $9 in an August 2026 budget guide.', 30.279, -97.7415, 'Downtown', '1409 Lavaca St', 'Texas Chili Parlor', 'estimated', 9, 9, 'flexible', null, null, false, null, 'PLACEHOLDER: Austinot cheap eats guide, found by web search (https://austinot.com/cheap-eats-austin)', null),
('Home Slice take-out window', 'Food and drink', 'Pizza take-out window. The guide lists a Don Juan taco at $6.25 and breakfast plates under $10.', 30.2509, -97.7499, 'South Congress', '1415 S Congress Ave', 'Home Slice', 'estimated', 6.25, 10, 'flexible', null, null, false, null, 'PLACEHOLDER: Austinot cheap eats guide, found by web search (https://austinot.com/cheap-eats-austin)', null),
('Cuantos Tacos', 'Food and drink', 'East Austin taco spot praised in a budget guide. Prices were not in the sources.', 30.2631, -97.7298, 'East Austin', '1200 E 6th St', 'Cuantos Tacos', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Austinot cheap eats guide, found by web search (https://austinot.com/cheap-eats-austin)', null),
('La Barbecue food truck', 'Food and drink', 'Barbecue truck where an ice cream scoop is $2 extra, per one guide. Menu prices were not in the sources.', 30.2554, -97.7173, 'East Austin', 'E Cesar Chavez St', 'La Barbecue', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Tasting Table, found by web search (https://www.tastingtable.com/travel/national/austin-best-cheap-food)', null),
('Manolis Ice Cream', 'Food and drink', 'Ice cream truck where the owners let you sample flavors. The location and prices were not checked.', null, null, null, null, 'Manolis Ice Cream', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Austin.com food truck guide, found by web search (https://austin.com/?p=44543105)', null),
('CJ''s Tacos', 'Food and drink', 'Taco truck that also sells ice cream, rated 4.8 on Yelp in a 2025 list. Price level is the lowest tier; no exact prices.', null, null, null, null, 'CJ''s Tacos', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Stacker list, found by web search (https://stacker.com/stories/texas/austin/highest-rated-cheap-eats-austin-diners)', null),
('Mueller Farmers Market', 'Food and drink', 'Weekly Sunday farmers market in the Mueller neighborhood. Free to walk around; you pay for what you buy. Times below come from memory of the usual schedule.', 30.2995, -97.705, 'Mueller', 'Mueller', null, 'free', 0, 0, 'fixed', 'Usually Sundays, 10 a.m.-2 p.m.; confirm', null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', '[{"start_local": "2026-11-22T10:00", "end_local": "2026-11-22T14:00"}, {"start_local": "2026-11-29T10:00", "end_local": "2026-11-29T14:00"}, {"start_local": "2026-12-06T10:00", "end_local": "2026-12-06T14:00"}, {"start_local": "2026-12-13T10:00", "end_local": "2026-12-13T14:00"}]'::jsonb),
('SFC Farmers'' Market Downtown', 'Food and drink', 'Saturday morning farmers market downtown. Free to walk around; times from memory of the usual schedule.', null, null, 'Downtown', null, 'Sustainable Food Center', 'free', 0, 0, 'fixed', 'Usually Saturdays, 9 a.m.-1 p.m.; confirm', null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', '[{"start_local": "2026-11-21T09:00", "end_local": "2026-11-21T13:00"}, {"start_local": "2026-11-28T09:00", "end_local": "2026-11-28T13:00"}, {"start_local": "2026-12-05T09:00", "end_local": "2026-12-05T13:00"}, {"start_local": "2026-12-12T09:00", "end_local": "2026-12-12T13:00"}]'::jsonb),
('Sunset Valley Farmers Market', 'Food and drink', 'Sunday farmers market in Sunset Valley, south of the city center. Times from memory of the usual schedule.', null, null, 'South Austin', null, null, 'free', 0, 0, 'fixed', 'Usually Sundays, 10 a.m.-2 p.m.; confirm', null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', '[{"start_local": "2026-11-22T10:00", "end_local": "2026-11-22T14:00"}, {"start_local": "2026-11-29T10:00", "end_local": "2026-11-29T14:00"}, {"start_local": "2026-12-06T10:00", "end_local": "2026-12-06T14:00"}, {"start_local": "2026-12-13T10:00", "end_local": "2026-12-13T14:00"}]'::jsonb),
('Texas Farmers'' Market at Lakeline', 'Food and drink', 'Saturday farmers market in far north Austin. Times from memory of the usual schedule.', null, null, 'North Austin', null, null, 'free', 0, 0, 'fixed', 'Usually Saturdays, 9 a.m.-1 p.m.; confirm', null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', '[{"start_local": "2026-11-21T09:00", "end_local": "2026-11-21T13:00"}, {"start_local": "2026-11-28T09:00", "end_local": "2026-11-28T13:00"}, {"start_local": "2026-12-05T09:00", "end_local": "2026-12-05T13:00"}, {"start_local": "2026-12-12T09:00", "end_local": "2026-12-12T13:00"}]'::jsonb),

-- ---------------------------------------------------------------- Games and trivia (TEC-85)
('Trivia at Barton Springs Saloon', 'Games and trivia', 'Weekly trivia night on Mondays, 7 to 9 p.m. in a listing. Cost not in the sources.', null, null, 'Zilker', null, 'Barton Springs Saloon', 'unknown', null, null, 'fixed', 'Reported Mondays, 7-9 p.m.', 120, null, null, 'PLACEHOLDER: ATXtoday trivia roundup, found by web search (https://atxtoday.6amcity.com/upcoming-trivia-nights-austin-tx)', '[{"start_local": "2026-11-16T19:00", "end_local": "2026-11-16T21:00"}, {"start_local": "2026-11-23T19:00", "end_local": "2026-11-23T21:00"}, {"start_local": "2026-11-30T19:00", "end_local": "2026-11-30T21:00"}, {"start_local": "2026-12-07T19:00", "end_local": "2026-12-07T21:00"}]'::jsonb),
('Trivia at Low Down Lounge', 'Games and trivia', 'Weekly Monday trivia night on East 6th. The start time and cost were not in the sources.', null, null, 'East Austin', null, 'Low Down Lounge', 'unknown', null, null, 'fixed', 'Reported Mondays; time not confirmed', null, null, null, 'PLACEHOLDER: ma.to listing, found by web search (https://ma.to/venue/lowdownlounge)', null),
('Trivia at Radio East', 'Games and trivia', 'Patio trivia at a coffee shop venue. One listing gave a 7 p.m. Tuesday start.', null, null, 'East Austin', null, 'Radio East', 'unknown', null, null, 'fixed', 'Reported Tuesdays, 7 p.m.', 120, null, null, 'PLACEHOLDER: Plano-mato listing, found by web search (https://www.planomato.com/en/austin/p/radio-roof-snake-trivia-702)', '[{"start_local": "2026-11-17T19:00", "end_local": "2026-11-17T21:00"}, {"start_local": "2026-11-24T19:00", "end_local": "2026-11-24T21:00"}, {"start_local": "2026-12-01T19:00", "end_local": "2026-12-01T21:00"}, {"start_local": "2026-12-08T19:00", "end_local": "2026-12-08T21:00"}]'::jsonb),
('Trivia at Lustre Pearl', 'Games and trivia', 'Tuesday trivia at 8 p.m. in an ATXtoday roundup. Cost not in the sources.', null, null, 'Downtown', null, 'Lustre Pearl', 'unknown', null, null, 'fixed', 'Reported Tuesdays, 8 p.m.', 120, null, null, 'PLACEHOLDER: ATXtoday trivia roundup, found by web search (https://atxtoday.6amcity.com/upcoming-trivia-nights-austin-tx)', '[{"start_local": "2026-11-17T20:00", "end_local": "2026-11-17T22:00"}, {"start_local": "2026-11-24T20:00", "end_local": "2026-11-24T22:00"}, {"start_local": "2026-12-01T20:00", "end_local": "2026-12-01T22:00"}, {"start_local": "2026-12-08T20:00", "end_local": "2026-12-08T22:00"}]'::jsonb),
('Trivia at Austin Eastciders Barton Springs', 'Games and trivia', 'Thursday trivia at 7 p.m. in an ATXtoday roundup. Cost not in the sources.', null, null, 'Zilker', null, 'Austin Eastciders', 'unknown', null, null, 'fixed', 'Reported Thursdays, 7 p.m.', 120, null, null, 'PLACEHOLDER: ATXtoday weekly roundup, found by web search (https://atxtoday.6amcity.com/events/weekly-activities-deals-austin)', '[{"start_local": "2026-11-19T19:00", "end_local": "2026-11-19T21:00"}, {"start_local": "2026-12-03T19:00", "end_local": "2026-12-03T21:00"}, {"start_local": "2026-12-10T19:00", "end_local": "2026-12-10T21:00"}, {"start_local": "2026-12-17T19:00", "end_local": "2026-12-17T21:00"}]'::jsonb),
('MUZINGO at Still Austin', 'Games and trivia', 'Music bingo night, listed for Thursdays at 7 p.m. Cost not in the sources.', null, null, null, null, 'Still Austin', 'unknown', null, null, 'fixed', 'Reported Thursdays, 7 p.m.', 120, null, null, 'PLACEHOLDER: ATXtoday weekly roundup, found by web search (https://atxtoday.6amcity.com/events/weekly-activities-deals-austin)', '[{"start_local": "2026-11-19T19:00", "end_local": "2026-11-19T21:00"}, {"start_local": "2026-12-03T19:00", "end_local": "2026-12-03T21:00"}, {"start_local": "2026-12-10T19:00", "end_local": "2026-12-10T21:00"}, {"start_local": "2026-12-17T19:00", "end_local": "2026-12-17T21:00"}]'::jsonb),
('Trivia at Cherrywood Coffeehouse', 'Games and trivia', 'Saturday trivia at 8 p.m. in the same roundup. Cost not in the sources.', null, null, 'Cherrywood', null, 'Cherrywood Coffeehouse', 'unknown', null, null, 'fixed', 'Reported Saturdays, 8 p.m.', 120, null, null, 'PLACEHOLDER: ATXtoday weekly roundup, found by web search (https://atxtoday.6amcity.com/events/weekly-activities-deals-austin)', '[{"start_local": "2026-11-21T20:00", "end_local": "2026-11-21T22:00"}, {"start_local": "2026-11-28T20:00", "end_local": "2026-11-28T22:00"}, {"start_local": "2026-12-05T20:00", "end_local": "2026-12-05T22:00"}, {"start_local": "2026-12-12T20:00", "end_local": "2026-12-12T22:00"}]'::jsonb),
('Music trivia at Tweedy''s Bar & Patio', 'Games and trivia', 'Regular music trivia nights. The listing does not say which night or the cost.', null, null, null, '2908 Fruth St', 'Tweedy''s Bar & Patio', 'unknown', null, null, 'fixed', 'Night not confirmed', null, null, null, 'PLACEHOLDER: ma.to listing, found by web search (https://ma.to/venue/tweedysbar)', null),
('Private karaoke at Punch Bowl Social', 'Games and trivia', 'Private karaoke rooms, per a downtown guide. Price and booking rules were not in the sources.', null, null, 'Downtown', null, 'Punch Bowl Social', 'unknown', null, null, 'flexible', null, null, null, null, 'PLACEHOLDER: Downtown Austin guide, found by web search (https://downtownaustin.com/blog/games-in-austin/)', null),

-- ---------------------------------------------------------------- Music and film (TEC-85)
('Elephant Room', 'Music and film', 'Basement jazz club downtown. Sources say weekday shows are usually free and weekends have a small cover.', 30.2677, -97.743, 'Downtown', '315 Congress Ave', 'Elephant Room', 'estimated', 0, 10, 'unknown', null, null, false, null, 'PLACEHOLDER: ATXtoday venue guide, found by web search (https://atxtoday.6amcity.com/city-guide/play/live-music-venues-austin-tx)', null),
('Skylark Lounge', 'Music and film', 'Live music lounge with weekly sessions, including a long-running soul night. Days and cover were not in the sources.', null, null, null, null, 'Skylark Lounge', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: Houstonia live music guide, found by web search (https://www.houstoniamag.com/arts-and-culture/music/where-to-see-live-music-in-austin/)', null),
('Beerland', 'Music and film', 'Small Red River rock club. Prices depend on the show.', null, null, 'Downtown', '711 Red River St', 'Beerland', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: Austin Chronicle music atlas, found by web search (https://www.austinchronicle.com/features/the-austin-music-atlas-12096286/)', null),
('Antone''s Nightclub', 'Music and film', 'Blues and live music club downtown. Prices depend on the show.', null, null, 'Downtown', null, 'Antone''s', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Stubb''s Bar-B-Q', 'Music and film', 'Barbecue restaurant with an indoor stage and an outdoor amphitheater on Red River. Prices depend on the show.', 30.2699, -97.736, 'Downtown', '801 Red River St', 'Stubb''s', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Hole in the Wall', 'Music and film', 'Longtime dive bar with live local bands near campus. Cover varies.', null, null, 'UT campus', '2538 Guadalupe St', 'Hole in the Wall', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Cactus Cafe', 'Music and film', 'Small listening room in the Texas Union at UT. Prices depend on the show.', 30.2849, -97.7413, 'UT campus', '2247 Guadalupe St', 'Cactus Cafe', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Red River Free Week', 'Music and film', 'Free shows at venues in and around the Red River Cultural District. Free Week 2026 ran Jan. 9-10 across 14 venues. The January 2027 dates were not in the sources.', 30.269, -97.737, 'Downtown', 'Red River Cultural District', null, 'free', 0, 0, 'unknown', null, null, false, null, 'PLACEHOLDER: ATXtoday Free Week guide, found by web search (https://atxtoday.6amcity.com/guide-free-week-austin)', null),
('Cap City Comedy Club', 'Music and film', 'Stand-up comedy club in north Austin. Ticket prices were not in the sources.', null, null, 'North Austin', null, 'Cap City Comedy Club', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),
('Austin Film Society Cinema', 'Music and film', 'Nonprofit cinema showing independent, classic and international films. Ticket prices were not checked.', null, null, 'North Austin', null, 'Austin Film Society', 'unknown', null, null, 'unknown', null, null, false, null, 'PLACEHOLDER: drafted from general knowledge of the venue; no page checked yet', null),

-- ---------------------------------------------------------------- Active (TEC-85)
('Highland Lanes', 'Active', 'Bowling alley in North Austin. A guide lists $27 per lane per hour on weekdays before 5 p.m. and $39 from Friday 5 p.m. to Sunday close, so the range is per lane per hour.', null, null, 'North Austin', null, 'Highland Lanes', 'estimated', 27, 39, 'flexible', null, null, false, null, 'PLACEHOLDER: Atly bowling guide, found by web search (https://www.atly.com/united-states/texas/austin/best-bowling)', null),
('Union Underground bowling', 'Active', 'Bowling in the Texas Union at UT, open to the public. Prices were not in the sources.', null, null, 'UT campus', null, 'Texas Union', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Atly bowling guide, found by web search (https://www.atly.com/united-states/texas/austin/best-bowling)', null),
('Pins & Wheels at Playland', 'Active', 'Bowling, roller skating and axe throwing. Bowling is listed from $10 on Thursdays; axe bays can be reserved in 30-minute steps. The price here is the Thursday bowling deal.', null, null, null, null, 'Pins & Wheels at Playland', 'estimated', 10, 10, 'flexible', null, null, null, null, 'PLACEHOLDER: Community Impact, found by web search (https://communityimpact.com/northwest-austin/business/pins-wheels-at-playland-brings-generations-together-through-skating-and-more/)', null),
('High 5 Entertainment', 'Active', 'Bowling and axe throwing on Anderson Lane. A review listing mentions $2 bowling on Tuesdays (may be dated); axe throwing is $18 per person, ages 18 and up with ID.', null, null, 'North Austin', 'Anderson Ln', 'High 5 Entertainment', 'estimated', 2, 18, 'flexible', null, null, null, null, 'PLACEHOLDER: Community Impact and a team-building listing, found by web search (https://communityimpact.com/northwest-austin/arts-entertainment/high-5-entertainment-center-in-north-austin-expands-to-add-ax-throwing/)', null),
('Peter Pan Mini Golf', 'Active', 'Classic mini golf on Barton Springs Road. No price was in the sources.', null, null, 'Zilker', 'Barton Springs Rd', 'Peter Pan Mini Golf', 'unknown', null, null, 'flexible', null, null, false, null, 'PLACEHOLDER: Dallasites101, found by web search (https://www.dallasites101.com/blog/post/indoor-activities-austin/)', null),
('The Dirdie Birdie', 'Active', 'Elevated 12-hole mini golf course with Austin landmarks and food. Price not in the sources.', null, null, null, null, 'The Dirdie Birdie', 'unknown', null, null, 'flexible', null, null, null, null, 'PLACEHOLDER: Dallasites101, found by web search (https://www.dallasites101.com/blog/post/indoor-activities-austin/)', null),
('Crux Climbing Center', 'Active', 'Climbing and bouldering gym on Pickle Road. A 2016 guide gave hours of Mon-Fri 11 a.m.-11 p.m. and Sat-Sun 10 a.m.-10 p.m.; price not found.', null, null, null, 'Pickle Rd', 'Crux Climbing Center', 'unknown', null, null, 'flexible', 'Per a 2016 guide: Mon-Fri 11-11, Sat-Sun 10-10; verify', null, false, null, 'PLACEHOLDER: Community Impact family guide, found by web search (https://communityimpact.com/northwest-austin/arts-entertainment/regional-family-entertainment-guide/)', null);

-- The existing weekly trivia row at Gibson Street Bar reported Tuesdays at 8 p.m.; give it session times too.
update public.experiences
set sessions = '[{"start_local":"2026-11-17T20:00","end_local":"2026-11-17T22:00"},{"start_local":"2026-11-24T20:00","end_local":"2026-11-24T22:00"},{"start_local":"2026-12-01T20:00","end_local":"2026-12-01T22:00"},{"start_local":"2026-12-08T20:00","end_local":"2026-12-08T22:00"}]'::jsonb
where name = 'Trivia at Gibson Street Bar' and sessions is null;
