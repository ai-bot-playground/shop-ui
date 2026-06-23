Feature: Flash-sale shopping journey
  As a buyer I can browse, buy, and watch my order status update live.

  Scenario: Browse the product list
    When I open the shop
    Then I see the list of products with their prices

  Scenario: Buy a product successfully
    Given I am viewing a product that is in stock
    When I click "Buy" once
    Then the buy button is disabled while the order is processing
    And the order status progresses from PENDING to CONFIRMED

  Scenario: Out of stock is communicated clearly
    Given I am viewing a product with no stock left
    When I click "Buy"
    Then I see an "out of stock" message and the order is REJECTED

  Scenario: Failed payment is communicated clearly
    Given my payment will be declined
    When I buy a product that is in stock
    Then I see a "payment failed" message and the order is CANCELLED

  Scenario: Double submit is prevented
    When I click "Buy" several times quickly
    Then only one order is created using the same Idempotency-Key
