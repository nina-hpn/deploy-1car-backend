import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, bookingStatus } from '../../booking/models/booking.entity';
import { BookingService } from '../../booking/services/booking.service';
import { DataSource } from 'typeorm';
import { TestUtils } from '../../../utils/testUtils';
import { PaymentController } from '../controllers/payment.controller';
import { Payment } from '../models/payment.entity';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import utils from '../../../utils/utils';
import { CarService } from '../../car/services/car.service';
import { Car } from '../../car/models/car.entity';
import { CarType } from '../../car/models/carType.entity';
import { CarSize } from '../../car/models/carSize.entity';
import { CarBrand } from '../../car/models/carBrand.entity';
import { UserService } from '../../user/services/user.service';
import { User } from '../../user/models/user.entity';
import { AuthService } from '../../auth/services/auth.service';
import { JwtService } from '@nestjs/jwt';

describe('PaymentService', () => {
  let moduleRef: TestingModule;
  let paymentService: PaymentService;
  let testUtils: TestUtils;
  let bookingService: BookingService;
  let carService: CarService;
  let stripeService: StripeService;
  let bookingRequest, userRequest;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT),
          username: process.env.DATABASE_USER,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
          migrations: ['dist/migrations/*.{ts,js}'],
          migrationsRun: true,
          autoLoadEntities: true,
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([Booking]),
        TypeOrmModule.forFeature([Payment]),
        TypeOrmModule.forFeature([Car]),
        TypeOrmModule.forFeature([CarType]),
        TypeOrmModule.forFeature([CarSize]),
        TypeOrmModule.forFeature([CarBrand]),
        TypeOrmModule.forFeature([User]),
      ],
      controllers: [PaymentController],
      providers: [
        UserService,
        AuthService,
        JwtService,
        PaymentService,
        BookingService,
        StripeService,
        CarService,
      ],
    }).compile();
    stripeService = moduleRef.get(StripeService);
    paymentService = moduleRef.get(PaymentService);
    bookingService = moduleRef.get(BookingService);
    carService = moduleRef.get(CarService);
    testUtils = new TestUtils(moduleRef.get(DataSource));
  }, 15000);

  beforeEach(async () => {
    jest.restoreAllMocks();
    await testUtils.cleanAll([
      'booking',
      'payment',
      'car_type',
      'car_size',
      'car_brand',
      'car',
    ]);
    await testUtils.loadAll([
      'booking',
      'payment',
      'car_type',
      'car_size',
      'car_brand',
      'car',
    ]);
    const carId = (await carService.getAllCar())[0].id;
    bookingRequest = {
      userId: '63c4f298-a75e-424e-998e-55f396a97d61',
      carId: carId,
      returnDateTime: '2018-01-15T08:54:45.000Z',
      receivedDateTime: '2018-01-25T08:54:45.000Z',
      amount: 4000,
      pickUpLocationId: '2711ad44-d7a2-4a3a-bcbe-c8d520d4ef6e',
    };
    userRequest = utils.loadJson('mocked_request');
  }, 15000);

  afterAll(async () => {
    await moduleRef.close();
  });

  it('CreateCheckoutSession -> should create booking entity with pending status', async () => {
    jest
      .spyOn(stripeService, 'createCheckoutSession')
      .mockImplementation(() => expect.anything());

    await paymentService.createCheckoutSession(bookingRequest, userRequest);
    const newBookings = await bookingService.getBookingsByUserId(
      bookingRequest.userId,
    );

    expect(newBookings).toHaveLength(1);
    expect(newBookings[0]).toHaveProperty('carId', bookingRequest.carId);
    expect(newBookings[0]).toHaveProperty(
      'returnDateTime',
      new Date(bookingRequest.returnDateTime),
    );
    expect(newBookings[0]).toHaveProperty(
      'bookingStatus',
      bookingStatus.PENDING,
    );
  });

  it('CreateCheckoutSession -> should call stripe service', async () => {
    // Mock stripe service to avoid direct call to external service
    const mockFn = jest
      .spyOn(stripeService, 'createCheckoutSession')
      .mockImplementation(() => expect.anything());

    await paymentService.createCheckoutSession(bookingRequest, userRequest);

    expect(mockFn).toBeCalledTimes(1);
  });

  it('handleIntentWebhook -> should update booking status when payment success', async () => {
    const mockedEventRequest = utils.loadJson(
      'intent_success_request',
    ) as RawBodyRequest<Request>;
    const mockedEvent = utils.loadJson(
      'intent_success_webhook',
    ) as Stripe.Event;

    const intentEvent = mockedEvent.data.object as Stripe.PaymentIntent;
    const testBooking = await bookingService.createBooking(
      bookingRequest,
      userRequest,
    );
    intentEvent.metadata.bookingId = testBooking.id;
    jest.spyOn(stripeService, 'constructEvent').mockReturnValue(mockedEvent);

    expect(
      (await bookingService.getBooking(testBooking.id)).bookingStatus,
    ).toBe(bookingStatus.PENDING);

    await paymentService.handleIntentWebhook(mockedEventRequest);

    expect(await bookingService.getBooking(testBooking.id)).not.toBeNull();
    expect(
      (await bookingService.getBooking(testBooking.id)).bookingStatus,
    ).toBe(bookingStatus.SUCCESS);
  });

  it('handleIntentWebhook -> should update booking status when payment faled', async () => {
    const mockedEventRequest = utils.loadJson(
      'intent_failed_request',
    ) as RawBodyRequest<Request>;
    const mockedEvent = utils.loadJson('intent_failed_webhook') as Stripe.Event;

    const intentEvent = mockedEvent.data.object as Stripe.PaymentIntent;
    const testBooking = await bookingService.createBooking(
      bookingRequest,
      userRequest,
    );
    intentEvent.metadata.bookingId = testBooking.id;
    jest.spyOn(stripeService, 'constructEvent').mockReturnValue(mockedEvent);

    expect(
      (await bookingService.getBooking(testBooking.id)).bookingStatus,
    ).toBe(bookingStatus.PENDING);

    await paymentService.handleIntentWebhook(mockedEventRequest);

    expect(await bookingService.getBooking(testBooking.id)).not.toBeNull();
    expect(
      (await bookingService.getBooking(testBooking.id)).bookingStatus,
    ).toBe(bookingStatus.FAIL);
  });

  it('handleIntentWebhook -> should throw BadRequestException for incorrect signature', async () => {
    const mockedEventRequest = utils.loadJson(
      'intent_failed_request',
    ) as RawBodyRequest<Request>;
    const payload = {
      id: 'evt_test_webhook',
      object: 'event',
    };
    const payloadString = JSON.stringify(payload, null, 2);
    const secret = 'whsec_test_secret';
    const header = stripeService.generateTestHeaderString(
      payloadString,
      secret,
    );
    jest
      .spyOn(stripeService, 'constructEvent')
      .mockImplementationOnce(() =>
        stripeService.constructEvent(
          payloadString,
          header,
          process.env.STRIPE_INTENT_WEBHOOK_SIG_KEY,
        ),
      );
    await expect(
      paymentService.handleIntentWebhook(mockedEventRequest),
    ).rejects.toThrowError(BadRequestException);
  });
});
