# Celery-Whiplash

Technical Machine specific API for interfacing between Celery and Whiplash

## CLI

### Setup

The only thing you need to do to set up is make sure the `example-config.json` file contains the correct API keys. Just replace the fields with the appropriate information and rename the file to `config.json`. Good to go.

### Tools

#### `help`
Prints the usage message to see what can be done with the client
`$ node cli/processOrder.js help`

#### `list [order_status] [payment_status] [fulfillment_status]`
List orders in celery with the given statuses
`$ node cli/processOrder.js list`
`$ node cli/processOrder.js list open paid unfulfilled`
`$ node cli/processOrder.js list refunded`
Note that you can just enter `list ouu` as a shortcut to list open unpaid and unfulfilled orders

#### `info <order_id>`
Prints information about an order from celery and whiplash
`$ node cli/processOrder.js info 101647469`

#### `status <status>`
Lists orders in whiplash with the given status
`$ node cli/processOrder.js status cancelled`
All available statuses: https://www.whiplashmerch.com/documentation/api#order-statuses

#### `create <order_id> [--nover] [--nocharge]`
Processes an order and creates the order in whiplash. You can skip order and card verification with the `--nover` flag. You can skip order verification, card verification, and charging an order using the `--nocharge` flag.
`$ node cli/processOrder.js create 101647469`
`$ node cli/processOrder.js create 101647469 --nover`
`$ node cli/processOrder.js create 101647469 --nocharge`

#### `cancel <order_id>`
Cancels an order in whiplash
`$ node cli/processOrder.js cancel 101647469`

#### `sync [--dryrun]`
Syncs all the orders between celery and whiplash. If you use the `--dryrun` flag you can list the changes that would be made without actually making them.
`$ node cli/processOrder.js cancel 101647469`
`$ node cli/processOrder.js cancel 101647469 --dryrun`

## Exported functions

### Integrated
`initWithKeys(config)` - Initializes your interaction with celery, whiplash, and zendesk. Make sure that this is called first and that you have a config file modeled after the provided example `example-config.json`.
`synchronizeOrders()` - Polling function used to synchronize celery and whiplash orders.
`processSingleOrder(orderID, nover, nocharge, noproc)` - Process an order from celery to whiplash. Skip card verification if the `nover` param is true. Skip verification and charging if the `nocharge` param is true. Skip processing the order if `noproc` is true.
`cancelSingleOrder` - Cancels and order in whiplash based off the id.
`refundOrder` - Refunds an order in celery based off the id.
`celeryJSONToWhiplash(celeryJSON)` - Converts the celery JSON object to be whiplash friendly.
`verifyInStock(whiplashJSON)` - Verifies that each part inside the order items field is in stock. Not currently doing that because we want to process orders, and this should disappear once proper storefront and inventory notifications are set up.
`getWhiplashOrderItems(celeryJSON)` - Take the celery line items and convert them to whiplash compatible order items based off the product skus.
`verifyOrderWithCelery(celeryOrder)` - Verify that the order, payment, and fulfillment status are all valid, as well as making sure the card and shipping address information exist and match.
`verifyCancelOrder(celeryOrder)` - Verify that the order is cancelled and thus needs to be cancelled in whiplash
`synchronize(celeryOrders, whiplashOrders)` - Take in an array of celery and whiplash orders and outputs an object of the various changes that need to be made.
`isInvalidCC(orderJSON)` - Checks that the payment source and shipping countries are not null and are the same.

### Celery
`fetchOrders(order_status, payment_status, fulfillment_status, since)` - Fetch orders from celery given the order status, payment status, and fulfillment status. Order older than the since param will not be fetched.
`fetchOrder(orderID)` - Fetch a specific order from celery given the id.
`createOrder(celeryJSON)` - Create an order in celery given the provided celery json
`cancelOrder(orderID)` - Cancel an order in celery given the id
`chargeOrder(whiplashJSON)` - Charge an order given the whiplash json. Note that it would be nice to convert this to take celeryJSON, but for now this is simpler for the promise chain.
`refundOrder(celeryJSON)` - Refunds the order given the celery json
`fulfillOrder(orderID, courier, number)` - Fulfills an order given the id. Note that the courier and tracking number are optional, but useful to the customer.
`sinceOrder` - The earliest order number that is compatible with the new polling method. Note that orders older than the unix time provided will not be able to sync correctly. However rest assured because one, all of those orders are already taken care of, and two, I'm pretty sure you're not reading this.

### Whiplash
`fetchOrders(limit, status, since)` - Fetches limit number of orders from whiplash with the given status. Both can be null. Orders older that the since param will not be fetched. 
`fetchOrder(celeryOrder)` - Fetch an order from whiplash given the celery order information. This is another function that could be updated to simply take an order number, but to that we say... not today.
`fetchItems()` - Fetches the items from whiplash and returns all their information.
`createOrder(whiplashJSON)` - Creates an order in whiplash given the whiplash json
`cancelOrder(whiplashJSON)` - Cancels an order in whiplash given the whiplash json
`sinceOrder` - The earliest order number that is compatible with the new polling method. Note that orders older than this order number will not be able to sync correctly. However rest assured because one, all of those orders are already taken care of, two, I'm pretty sure you're not reading this, and three, got you again.

### Zendesk
`getTickets(tag, callback)` - Fetches tickets with the given tag and calls the callback function provided.
`createTickets(subject, body, tags, callback, noDuplicates)` - Creates a ticket in zendesk with the provided subject, body, and tags. noDuplicates is used as a boolean flag to indicate that if the tag provided is already in zendesk then don't create another ticket.