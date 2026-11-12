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
